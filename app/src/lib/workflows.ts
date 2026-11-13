import { db } from './db'

export type WorkflowTriggerType = 'manual' | 'stage_enter' | 'record_create' | 'field_change'

export type WorkflowStepType = 'approval' | 'notify' | 'create_record' | 'update_field' | 'webhook' | 'ask_ai'

export type WorkflowStep = {
  type: WorkflowStepType
  name: string
  config: Record<string, unknown>
}

export type WorkflowDefinition = {
  id: string
  workflow_key: string
  name: string
  description: string
  trigger_type: WorkflowTriggerType
  trigger_config: Record<string, unknown>
  steps: WorkflowStep[]
  active: boolean
}

export type WorkflowDefinitionInput = {
  workflow_key?: string
  name: string
  description?: string
  trigger_type: WorkflowTriggerType
  trigger_config?: Record<string, unknown>
  steps?: WorkflowStep[]
  active?: boolean
}

export const WORKFLOW_TRIGGERS: { value: WorkflowTriggerType; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'stage_enter', label: 'Stage enter' },
  { value: 'record_create', label: 'Record create' },
  { value: 'field_change', label: 'Field change' },
]

export const WORKFLOW_STEP_TYPES: { value: WorkflowStepType; label: string }[] = [
  { value: 'approval', label: 'Approval' },
  { value: 'notify', label: 'Notify' },
  { value: 'create_record', label: 'Create record' },
  { value: 'update_field', label: 'Update field' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'ask_ai', label: 'Ask AI' },
]

export function slugifyWorkflowKey(name: string): string {
  return (
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'workflow'
  )
}

export function buildApprovalStep(opts?: {
  name?: string
  approverRole?: string
}): WorkflowStep {
  return {
    type: 'approval',
    name: opts?.name || 'Approval',
    config: {
      approver_role: opts?.approverRole || 'admin',
      required: true,
    },
  }
}

export function buildNotifyStep(opts?: {
  name?: string
  channel?: string
  message?: string
}): WorkflowStep {
  return {
    type: 'notify',
    name: opts?.name || 'Notify',
    config: {
      channel: opts?.channel || 'in_app',
      message: opts?.message || '',
    },
  }
}

export function parseWorkflowSteps(raw: unknown): WorkflowStep[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const type = String(row.type || '') as WorkflowStepType
      if (!WORKFLOW_STEP_TYPES.some((t) => t.value === type)) return null
      return {
        type,
        name: String(row.name || type),
        config:
          row.config && typeof row.config === 'object' && !Array.isArray(row.config)
            ? (row.config as Record<string, unknown>)
            : {},
      } satisfies WorkflowStep
    })
    .filter(Boolean) as WorkflowStep[]
}

export function describeWorkflowTrigger(def: Pick<WorkflowDefinition, 'trigger_type' | 'trigger_config'>): string {
  if (def.trigger_type === 'stage_enter') {
    const pipe = String(def.trigger_config?.pipeline_key || '')
    const stage = String(def.trigger_config?.stage_key || '')
    if (pipe && stage) return `When ${pipe} enters ${stage}`
    return 'On stage enter'
  }
  return WORKFLOW_TRIGGERS.find((t) => t.value === def.trigger_type)?.label || def.trigger_type
}

export async function listWorkflowDefinitions(opts?: {
  includeInactive?: boolean
}): Promise<WorkflowDefinition[]> {
  let q = db
    .from('workflow_definitions')
    .select('id, workflow_key, name, description, trigger_type, trigger_config, steps, active')
    .order('name')
  if (!opts?.includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error || !data) return []
  return (data as WorkflowDefinition[]).map((row) => ({
    ...row,
    trigger_config: (row.trigger_config || {}) as Record<string, unknown>,
    steps: parseWorkflowSteps(row.steps),
  }))
}

export async function saveWorkflowDefinition(
  input: WorkflowDefinitionInput,
  existingId?: string,
): Promise<WorkflowDefinition> {
  const workflow_key = (input.workflow_key || slugifyWorkflowKey(input.name)).slice(0, 48)
  const row = {
    workflow_key,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    trigger_type: input.trigger_type,
    trigger_config: input.trigger_config || {},
    steps: input.steps || [],
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  }
  if (existingId) {
    const { data, error } = await db
      .from('workflow_definitions')
      .update(row)
      .eq('id', existingId)
      .select('id, workflow_key, name, description, trigger_type, trigger_config, steps, active')
      .single()
    if (error) throw error
    return {
      ...(data as WorkflowDefinition),
      trigger_config: ((data as WorkflowDefinition).trigger_config || {}) as Record<string, unknown>,
      steps: parseWorkflowSteps((data as WorkflowDefinition).steps),
    }
  }
  const { data, error } = await db
    .from('workflow_definitions')
    .insert(row)
    .select('id, workflow_key, name, description, trigger_type, trigger_config, steps, active')
    .single()
  if (error) throw error
  return {
    ...(data as WorkflowDefinition),
    trigger_config: ((data as WorkflowDefinition).trigger_config || {}) as Record<string, unknown>,
    steps: parseWorkflowSteps((data as WorkflowDefinition).steps),
  }
}

export async function setWorkflowDefinitionActive(id: string, active: boolean): Promise<void> {
  const { error } = await db
    .from('workflow_definitions')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
