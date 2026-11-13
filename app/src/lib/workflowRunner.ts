import { logActivity } from './activity'
import { db } from './db'
import {
  listWorkflowDefinitions,
  parseWorkflowSteps,
  type WorkflowDefinition,
  type WorkflowStep,
} from './workflows'
import type { UserRole } from './types'

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type WorkflowRunContext = {
  object_type?: string
  record_id?: string
  record_label?: string
  pipeline_key?: string
  stage_key?: string
  actor_email?: string
  notifications?: string[]
  step_log?: WorkflowStepLogEntry[]
  [key: string]: unknown
}

export type WorkflowStepLogEntry = {
  index: number
  type: string
  name: string
  status: 'done' | 'awaiting' | 'skipped' | 'failed'
  at: string
  detail?: string
}

export type WorkflowRun = {
  id: string
  definition_id: string
  status: WorkflowRunStatus
  context: WorkflowRunContext
  current_step: number
  error_message: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  definition?: Pick<WorkflowDefinition, 'id' | 'name' | 'workflow_key' | 'steps' | 'trigger_type'>
}

export function matchesStageEnter(
  def: Pick<WorkflowDefinition, 'active' | 'trigger_type' | 'trigger_config'>,
  pipelineKey: string,
  stageKey: string,
): boolean {
  if (!def.active) return false
  if (def.trigger_type !== 'stage_enter') return false
  const pipe = String(def.trigger_config?.pipeline_key || '')
  const stage = String(def.trigger_config?.stage_key || '')
  return pipe === pipelineKey && stage === stageKey
}

export function roleCanApprove(userRole: UserRole | string | null | undefined, requiredRole: string): boolean {
  const need = String(requiredRole || 'admin').toLowerCase()
  const have = String(userRole || '').toLowerCase()
  if (!have) return false
  if (need === 'admin') return have === 'admin'
  if (need === 'manager') return have === 'admin' || have === 'manager'
  return have === need || have === 'admin'
}

function nowIso(): string {
  return new Date().toISOString()
}

function appendLog(
  context: WorkflowRunContext,
  entry: Omit<WorkflowStepLogEntry, 'at'> & { at?: string },
): WorkflowRunContext {
  const step_log = [...(context.step_log || []), { ...entry, at: entry.at || nowIso() }]
  return { ...context, step_log }
}

/** Pure: advance through steps until approval pause, failure, or completion. */
export function processSteps(
  steps: WorkflowStep[],
  startIndex: number,
  context: WorkflowRunContext,
): {
  status: WorkflowRunStatus
  current_step: number
  context: WorkflowRunContext
  error_message: string
} {
  let ctx: WorkflowRunContext = {
    ...context,
    notifications: [...(context.notifications || [])],
  }
  let i = Math.max(0, startIndex)

  while (i < steps.length) {
    const step = steps[i]
    if (!step) break

    if (step.type === 'approval') {
      ctx = appendLog(ctx, {
        index: i,
        type: step.type,
        name: step.name,
        status: 'awaiting',
        detail: `Needs ${String(step.config.approver_role || 'admin')}`,
      })
      return {
        status: 'awaiting_approval',
        current_step: i,
        context: ctx,
        error_message: '',
      }
    }

    if (step.type === 'notify') {
      const message = String(step.config.message || step.name || 'Notification')
      ctx = {
        ...ctx,
        notifications: [...(ctx.notifications || []), message],
      }
      ctx = appendLog(ctx, {
        index: i,
        type: step.type,
        name: step.name,
        status: 'done',
        detail: message,
      })
      i += 1
      continue
    }

    // Unsupported step types are skipped (recorded) so packs can grow later.
    ctx = appendLog(ctx, {
      index: i,
      type: step.type,
      name: step.name,
      status: 'skipped',
      detail: `Step type "${step.type}" not implemented yet`,
    })
    i += 1
  }

  return {
    status: 'completed',
    current_step: steps.length,
    context: ctx,
    error_message: '',
  }
}

async function fetchDefinition(id: string): Promise<WorkflowDefinition | null> {
  const { data, error } = await db
    .from('workflow_definitions')
    .select('id, workflow_key, name, description, trigger_type, trigger_config, steps, active')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return {
    ...(data as WorkflowDefinition),
    trigger_config: ((data as WorkflowDefinition).trigger_config || {}) as Record<string, unknown>,
    steps: parseWorkflowSteps((data as WorkflowDefinition).steps),
  }
}

async function persistRun(
  id: string,
  patch: {
    status: WorkflowRunStatus
    context: WorkflowRunContext
    current_step: number
    error_message?: string
    started_at?: string | null
    completed_at?: string | null
  },
): Promise<void> {
  const { error } = await db
    .from('workflow_runs')
    .update({
      status: patch.status,
      context: patch.context,
      current_step: patch.current_step,
      error_message: patch.error_message || '',
      started_at: patch.started_at,
      completed_at: patch.completed_at,
      updated_at: nowIso(),
    })
    .eq('id', id)
  if (error) throw error
}

async function writeNotifyActivity(run: WorkflowRun, defName: string, message: string): Promise<void> {
  const label = String(run.context.record_label || run.context.record_id || defName)
  await logActivity(
    'workflow_notify',
    String(run.context.object_type || 'workflow'),
    label,
    `${defName}: ${message}`,
    String(run.context.actor_email || ''),
    run.context.object_type === 'crm' ? String(run.context.record_id || '') : null,
  )
}

export async function startWorkflowRun(
  def: WorkflowDefinition,
  context: WorkflowRunContext,
): Promise<WorkflowRun> {
  const started = nowIso()
  const { data, error } = await db
    .from('workflow_runs')
    .insert({
      definition_id: def.id,
      status: 'running',
      context,
      current_step: 0,
      error_message: '',
      started_at: started,
      updated_at: started,
    })
    .select('id, definition_id, status, context, current_step, error_message, started_at, completed_at, created_at')
    .single()
  if (error) throw error

  const run = {
    ...(data as WorkflowRun),
    context: (data.context || {}) as WorkflowRunContext,
  }

  const result = processSteps(def.steps, 0, run.context)
  const completed_at = result.status === 'completed' || result.status === 'failed' ? nowIso() : null
  await persistRun(run.id, {
    status: result.status,
    context: result.context,
    current_step: result.current_step,
    error_message: result.error_message,
    started_at: started,
    completed_at,
  })

  for (const msg of result.context.notifications || []) {
    await writeNotifyActivity({ ...run, context: result.context }, def.name, msg)
  }

  return {
    ...run,
    status: result.status,
    context: result.context,
    current_step: result.current_step,
    error_message: result.error_message,
    completed_at,
    definition: {
      id: def.id,
      name: def.name,
      workflow_key: def.workflow_key,
      steps: def.steps,
      trigger_type: def.trigger_type,
    },
  }
}

/** Fire all active stage_enter workflows for a pipeline/stage. Returns started runs. */
export async function triggerStageEnterWorkflows(input: {
  pipelineKey: string
  stageKey: string
  objectType: string
  recordId: string
  recordLabel: string
  actorEmail: string
}): Promise<WorkflowRun[]> {
  const defs = await listWorkflowDefinitions()
  const matched = defs.filter((d) => matchesStageEnter(d, input.pipelineKey, input.stageKey))
  const runs: WorkflowRun[] = []
  for (const def of matched) {
    const run = await startWorkflowRun(def, {
      object_type: input.objectType,
      record_id: input.recordId,
      record_label: input.recordLabel,
      pipeline_key: input.pipelineKey,
      stage_key: input.stageKey,
      actor_email: input.actorEmail,
      notifications: [],
      step_log: [],
    })
    runs.push(run)
  }
  return runs
}

export async function listWorkflowRuns(opts?: {
  status?: WorkflowRunStatus
  limit?: number
}): Promise<WorkflowRun[]> {
  let q = db
    .from('workflow_runs')
    .select(
      'id, definition_id, status, context, current_step, error_message, started_at, completed_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50)
  if (opts?.status) q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error || !data) return []

  const runs = (data as WorkflowRun[]).map((row) => ({
    ...row,
    context: (row.context || {}) as WorkflowRunContext,
  }))

  const defIds = [...new Set(runs.map((r) => r.definition_id))]
  if (!defIds.length) return runs

  const { data: defs } = await db
    .from('workflow_definitions')
    .select('id, workflow_key, name, trigger_type, steps')
    .in('id', defIds)
  const byId = new Map(
    ((defs || []) as WorkflowDefinition[]).map((d) => [
      d.id,
      {
        id: d.id,
        name: d.name,
        workflow_key: d.workflow_key,
        trigger_type: d.trigger_type,
        steps: parseWorkflowSteps(d.steps),
      },
    ]),
  )
  return runs.map((r) => ({ ...r, definition: byId.get(r.definition_id) }))
}

export async function listPendingApprovals(): Promise<WorkflowRun[]> {
  return listWorkflowRuns({ status: 'awaiting_approval', limit: 40 })
}

export async function resolveWorkflowApproval(input: {
  runId: string
  approve: boolean
  userRole: UserRole
  actorEmail: string
  note?: string
}): Promise<WorkflowRun> {
  const { data, error } = await db
    .from('workflow_runs')
    .select(
      'id, definition_id, status, context, current_step, error_message, started_at, completed_at, created_at',
    )
    .eq('id', input.runId)
    .single()
  if (error) throw error
  const run: WorkflowRun = {
    ...(data as WorkflowRun),
    context: ((data as WorkflowRun).context || {}) as WorkflowRunContext,
  }
  if (run.status !== 'awaiting_approval') {
    throw new Error('This run is not waiting for approval')
  }

  const def = await fetchDefinition(run.definition_id)
  if (!def) throw new Error('Workflow definition missing')
  const step = def.steps[run.current_step]
  if (!step || step.type !== 'approval') {
    throw new Error('Current step is not an approval')
  }
  const required = String(step.config.approver_role || 'admin')
  if (!roleCanApprove(input.userRole, required)) {
    throw new Error(`Needs ${required} to approve`)
  }

  let ctx = appendLog(run.context, {
    index: run.current_step,
    type: step.type,
    name: step.name,
    status: input.approve ? 'done' : 'failed',
    detail: input.approve
      ? `Approved by ${input.actorEmail}${input.note ? `: ${input.note}` : ''}`
      : `Rejected by ${input.actorEmail}${input.note ? `: ${input.note}` : ''}`,
  })
  ctx = { ...ctx, actor_email: input.actorEmail }

  if (!input.approve) {
    await persistRun(run.id, {
      status: 'cancelled',
      context: ctx,
      current_step: run.current_step,
      error_message: 'Rejected',
      started_at: run.started_at,
      completed_at: nowIso(),
    })
    await logActivity(
      'workflow_rejected',
      String(ctx.object_type || 'workflow'),
      String(ctx.record_label || def.name),
      `${def.name} rejected`,
      input.actorEmail,
      ctx.object_type === 'crm' ? String(ctx.record_id || '') : null,
    )
    return { ...run, status: 'cancelled', context: ctx, error_message: 'Rejected', completed_at: nowIso() }
  }

  const beforeNotifyCount = (ctx.notifications || []).length
  const result = processSteps(def.steps, run.current_step + 1, ctx)
  const completed_at =
    result.status === 'completed' || result.status === 'failed' ? nowIso() : null
  await persistRun(run.id, {
    status: result.status,
    context: result.context,
    current_step: result.current_step,
    error_message: result.error_message,
    started_at: run.started_at,
    completed_at,
  })

  const newNotes = (result.context.notifications || []).slice(beforeNotifyCount)
  for (const msg of newNotes) {
    await writeNotifyActivity({ ...run, context: result.context }, def.name, msg)
  }

  return {
    ...run,
    status: result.status,
    context: result.context,
    current_step: result.current_step,
    error_message: result.error_message,
    completed_at,
    definition: {
      id: def.id,
      name: def.name,
      workflow_key: def.workflow_key,
      steps: def.steps,
      trigger_type: def.trigger_type,
    },
  }
}

export function summarizeRun(run: WorkflowRun): string {
  const label = String(run.context.record_label || run.context.record_id || '—')
  const name = run.definition?.name || 'Workflow'
  if (run.status === 'awaiting_approval') return `${name} · ${label} · waiting for approval`
  if (run.status === 'completed') return `${name} · ${label} · done`
  if (run.status === 'cancelled') return `${name} · ${label} · cancelled`
  if (run.status === 'failed') return `${name} · ${label} · failed`
  return `${name} · ${label} · ${run.status}`
}
