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

export async function listPlanningScenarios(): Promise<PlanningScenario[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('planning_scenarios')
    .select('id, name, description, assumptions_json, active')
    .eq('active', true)
    .order('name')
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
