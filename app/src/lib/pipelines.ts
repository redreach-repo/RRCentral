import { PIPELINE_STAGES } from './config'
import { db } from './db'

export type PipelineOutcome = 'open' | 'won' | 'lost'

export type Pipeline = {
  id: string
  pipeline_key: string
  name: string
  object_type: string
  description: string
  sort_order: number
  active: boolean
}

export type PipelineStage = {
  id: string
  pipeline_id: string
  stage_key: string
  label: string
  color: string
  outcome: PipelineOutcome
  sort_order: number
  active: boolean
}

export type PipelineStageInput = {
  pipeline_id: string
  stage_key?: string
  label: string
  color?: string
  outcome?: PipelineOutcome
  sort_order?: number
  active?: boolean
}

export const PIPELINE_OUTCOMES: { value: PipelineOutcome; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

export const DEFAULT_STAGE_COLORS = [
  '#64748B',
  '#0EA5E9',
  '#8B5CF6',
  '#F59E0B',
  '#16A34A',
  '#DC2626',
  '#06B6D4',
  '#E8872A',
] as const

/** Stable stage_key from a label (CRM uses Title Case keys historically). */
export function slugifyStageKey(label: string, style: 'title' | 'snake' = 'title'): string {
  const cleaned = String(label || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, style === 'snake' ? '_' : ' ')
    .replace(/^_+|_+$/g, '')
    .trim()
  if (!cleaned) return style === 'snake' ? 'stage' : 'Stage'
  if (style === 'snake') {
    return cleaned.toLowerCase().replace(/\s+/g, '_').slice(0, 48)
  }
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .slice(0, 48)
}

export function stageKeyStyleForPipeline(pipelineKey: string): 'title' | 'snake' {
  return pipelineKey === 'crm' ? 'title' : 'snake'
}

export function stageLabels(stages: Pick<PipelineStage, 'stage_key' | 'label' | 'active'>[]): string[] {
  return stages.filter((s) => s.active !== false).map((s) => s.stage_key)
}

export function fallbackCrmStageLabels(): string[] {
  return [...PIPELINE_STAGES]
}

export function isClosedOutcome(outcome: PipelineOutcome): boolean {
  return outcome === 'won' || outcome === 'lost'
}

export async function listPipelines(opts?: { includeInactive?: boolean }): Promise<Pipeline[]> {
  let q = db
    .from('pipelines')
    .select('id, pipeline_key, name, object_type, description, sort_order, active')
    .order('sort_order')
    .order('name')
  if (!opts?.includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error || !data) return []
  return data as Pipeline[]
}

export async function listPipelineStages(
  pipelineId: string,
  opts?: { includeInactive?: boolean },
): Promise<PipelineStage[]> {
  let q = db
    .from('pipeline_stages')
    .select('id, pipeline_id, stage_key, label, color, outcome, sort_order, active')
    .eq('pipeline_id', pipelineId)
    .order('sort_order')
    .order('label')
  if (!opts?.includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error || !data) return []
  return data as PipelineStage[]
}

export async function listStagesByPipelineKey(
  pipelineKey: string,
  opts?: { includeInactive?: boolean },
): Promise<PipelineStage[]> {
  const { data: pipe, error } = await db
    .from('pipelines')
    .select('id')
    .eq('pipeline_key', pipelineKey)
    .maybeSingle()
  if (error || !pipe?.id) return []
  return listPipelineStages(pipe.id, opts)
}

/** CRM board labels: DB stages when present, else hardcoded PIPELINE_STAGES. */
export async function loadCrmStageKeys(): Promise<string[]> {
  try {
    const stages = await listStagesByPipelineKey('crm')
    const keys = stageLabels(stages)
    return keys.length ? keys : fallbackCrmStageLabels()
  } catch {
    return fallbackCrmStageLabels()
  }
}

export async function savePipelineStage(
  input: PipelineStageInput,
  existingId?: string,
): Promise<PipelineStage> {
  const stage_key = (input.stage_key || slugifyStageKey(input.label, 'title')).slice(0, 48)
  const row = {
    pipeline_id: input.pipeline_id,
    stage_key,
    label: input.label.trim(),
    color: (input.color || '#64748B').trim() || '#64748B',
    outcome: input.outcome || 'open',
    sort_order: Number(input.sort_order) || 0,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  }
  if (existingId) {
    const { data, error } = await db
      .from('pipeline_stages')
      .update(row)
      .eq('id', existingId)
      .select('id, pipeline_id, stage_key, label, color, outcome, sort_order, active')
      .single()
    if (error) throw error
    return data as PipelineStage
  }
  const { data, error } = await db
    .from('pipeline_stages')
    .insert(row)
    .select('id, pipeline_id, stage_key, label, color, outcome, sort_order, active')
    .single()
  if (error) throw error
  return data as PipelineStage
}

export async function setPipelineStageActive(id: string, active: boolean): Promise<void> {
  const { error } = await db
    .from('pipeline_stages')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
