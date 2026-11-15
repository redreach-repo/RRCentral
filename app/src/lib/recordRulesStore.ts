import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import type { RecordRule } from './recordRules'

export type RecordRuleRow = RecordRule & {
  id: string
  name: string
  filter_json: Record<string, unknown>
}

export async function listRecordRules(objectType?: string): Promise<RecordRuleRow[]> {
  if (!isSupabaseConfigured()) return []
  let q = db
    .from('record_rules')
    .select('id, object_type, name, scope, filter_json, active')
    .order('object_type')
  if (objectType) q = q.eq('object_type', objectType)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as RecordRuleRow[]
}

export async function createRecordRule(input: {
  objectType: string
  name: string
  scope: string
}): Promise<void> {
  const { error } = await db.from('record_rules').insert({
    object_type: input.objectType.trim(),
    name: input.name.trim(),
    scope: input.scope || 'owner',
    filter_json: {},
    active: true,
  })
  if (error) throw error
}
