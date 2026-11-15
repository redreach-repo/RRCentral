import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'

export type PlanningScenario = {
  id: string
  name: string
  description: string
  assumptions_json: Record<string, unknown>
  active: boolean
}

export async function listPlanningScenarios(opts?: {
  includeInactive?: boolean
}): Promise<PlanningScenario[]> {
  if (!isSupabaseConfigured()) return []
  let q = db
    .from('planning_scenarios')
    .select('id, name, description, assumptions_json, active')
    .order('name')
  if (!opts?.includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as PlanningScenario[]
}

export async function createPlanningScenario(input: {
  name: string
  description?: string
  assumptions?: Record<string, unknown>
}): Promise<void> {
  const { error } = await db.from('planning_scenarios').insert({
    name: input.name.trim(),
    description: (input.description || '').trim(),
    assumptions_json: input.assumptions || { revenue_uplift_pct: 0 },
    active: true,
  })
  if (error) throw error
}

export async function updatePlanningScenario(
  id: string,
  patch: { name?: string; description?: string; assumptions?: Record<string, unknown> },
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.description !== undefined) row.description = patch.description.trim()
  if (patch.assumptions !== undefined) row.assumptions_json = patch.assumptions
  if (!Object.keys(row).length) return
  const { error } = await db.from('planning_scenarios').update(row).eq('id', id)
  if (error) throw error
}

export async function deactivatePlanningScenario(id: string): Promise<void> {
  const { error } = await db.from('planning_scenarios').update({ active: false }).eq('id', id)
  if (error) throw error
}

export async function reactivatePlanningScenario(id: string): Promise<void> {
  const { error } = await db.from('planning_scenarios').update({ active: true }).eq('id', id)
  if (error) throw error
}
