import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import { currentPeriodYyyyMm } from './planningGoals'

export type PlanningGoal = {
  id: string
  name: string
  metric_key: string
  target_value: number
  period_yyyy_mm: string
  status: string
  notes: string
}

export async function listPlanningGoals(period?: string): Promise<PlanningGoal[]> {
  if (!isSupabaseConfigured()) return []
  let q = db
    .from('planning_goals')
    .select('id, name, metric_key, target_value, period_yyyy_mm, status, notes')
    .order('period_yyyy_mm', { ascending: false })
    .limit(100)
  if (period) q = q.eq('period_yyyy_mm', period)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []).map((r: PlanningGoal) => ({
    ...r,
    target_value: Number(r.target_value) || 0,
  }))
}

export async function createPlanningGoal(input: {
  name: string
  metricKey: string
  targetValue: number
  periodYyyyMm?: string
  notes?: string
  status?: string
}): Promise<void> {
  const { error } = await db.from('planning_goals').insert({
    name: input.name.trim(),
    metric_key: input.metricKey || 'revenue_aed',
    target_value: Number(input.targetValue) || 0,
    period_yyyy_mm: input.periodYyyyMm || currentPeriodYyyyMm(),
    status: (input.status || 'active').trim() || 'active',
    notes: (input.notes || '').trim(),
  })
  if (error) throw error
}

export async function setPlanningGoalStatus(id: string, status: string): Promise<void> {
  const { error } = await db
    .from('planning_goals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
