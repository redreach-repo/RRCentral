import { db, isSupabaseConfigured } from './db'
import { errorCode, isMissingRelationError, rawErrorMessage } from './errors'
import type { MergeCandidate, MergePreview } from './clientMerge'

/** True when the merge SQL (20261341090000_client_merge.sql) has not been run. */
export function isClientMergeMissing(err: unknown): boolean {
  const code = errorCode(err)
  return code === 'PGRST202' || code === '42883' || code === '42703' || isMissingRelationError(err) || /rr_client_merge|merged_into/.test(rawErrorMessage(err))
}

/** Active clients (not merged or deleted), for the suggested groups and the pickers. */
export async function loadMergeCandidates(): Promise<MergeCandidate[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db.from('clients').select('id, company_name, trn, email, created_at, merged_into, deleted_at').order('company_name')
  if (error) throw error
  return ((data || []) as Record<string, unknown>[])
    .filter((c) => !c.merged_into && !c.deleted_at)
    .map((c) => ({
      id: String(c.id),
      company_name: String(c.company_name || ''),
      trn: String(c.trn || ''),
      email: String(c.email || ''),
      created_at: (c.created_at as string) || null,
    }))
}

export async function previewClientMerge(survivorId: string, duplicateIds: string[]): Promise<MergePreview> {
  const { data, error } = await db.rpc('rr_client_merge_preview', { p_survivor: survivorId, p_duplicates: duplicateIds })
  if (error) throw error
  return data as MergePreview
}

export async function runClientMerge(input: {
  survivorId: string
  duplicateIds: string[]
  fields: Record<string, string>
  linkUnlinked: boolean
  confirm: string
  reason: string
}): Promise<{ merge_id: string; counts: Record<string, number> }> {
  const { data, error } = await db.rpc('rr_client_merge', {
    p_survivor: input.survivorId,
    p_duplicates: input.duplicateIds,
    p_fields: input.fields,
    p_link_unlinked: input.linkUnlinked,
    p_confirm: input.confirm,
    p_reason: input.reason,
  })
  if (error) throw error
  return data as { merge_id: string; counts: Record<string, number> }
}

export type ClientMergeLog = {
  id: string
  survivor_id: string
  duplicate_ids: string[]
  survivor_name: string
  duplicate_names: string[]
  counts: Record<string, number>
  reason: string
  merged_by_email: string
  merged_at: string
  undone_at: string | null
}

export async function loadRecentMerges(limit = 20): Promise<ClientMergeLog[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('client_merges')
    .select('id, survivor_id, duplicate_ids, survivor_before, duplicates_before, counts, reason, merged_by_email, merged_at, undone_at')
    .order('merged_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isClientMergeMissing(error)) return []
    throw error
  }
  return ((data || []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    survivor_id: String(m.survivor_id),
    duplicate_ids: (m.duplicate_ids as string[]) || [],
    survivor_name: String((m.survivor_before as Record<string, unknown>)?.company_name || ''),
    duplicate_names: (((m.duplicates_before as Record<string, unknown>[]) || []).map((d) => String(d.company_name || ''))),
    counts: (m.counts as Record<string, number>) || {},
    reason: String(m.reason || ''),
    merged_by_email: String(m.merged_by_email || ''),
    merged_at: String(m.merged_at || ''),
    undone_at: (m.undone_at as string) || null,
  }))
}

export async function undoClientMerge(mergeId: string, reason = ''): Promise<{ rows_moved_back: number }> {
  const { data, error } = await db.rpc('rr_client_merge_undo', { p_merge_id: mergeId, p_reason: reason })
  if (error) throw error
  return data as { rows_moved_back: number }
}
