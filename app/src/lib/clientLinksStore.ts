import { db, isSupabaseConfigured } from './db'
import { errorCode, isMissingRelationError, rawErrorMessage } from './errors'
import type { ClientLinkRow, ClientLinkTable, ClientOption } from './clientLinks'

/** True when 20261339090000_client_links.sql has not been run yet. */
export function isClientLinksMissing(err: unknown): boolean {
  const code = errorCode(err)
  return code === 'PGRST202' || code === '42883' || isMissingRelationError(err) || /rr_link_clients/.test(rawErrorMessage(err))
}

export type ClientLinkReview = { rows: ClientLinkRow[]; clients: ClientOption[]; setupMissing: boolean }

export async function loadClientLinkReview(): Promise<ClientLinkReview> {
  if (!isSupabaseConfigured()) return { rows: [], clients: [], setupMissing: true }
  const [links, clients] = await Promise.all([
    db.rpc('rr_link_clients', { p_apply: false }),
    db.from('clients').select('id, company_name').order('company_name'),
  ])
  if (links.error) {
    if (isClientLinksMissing(links.error)) return { rows: [], clients: [], setupMissing: true }
    throw links.error
  }
  if (clients.error) throw clients.error
  return { rows: (links.data || []) as ClientLinkRow[], clients: (clients.data || []) as ClientOption[], setupMissing: false }
}

/** Link (or with null, unlink) one document. Managers and admins. */
export async function setDocumentClient(table: ClientLinkTable, rowId: string, clientId: string | null): Promise<void> {
  const { error } = await db.rpc('rr_set_document_client', { p_table: table, p_row_id: rowId, p_client_id: clientId })
  if (error) throw error
}

/** Link every one-match document at once (admins). Returns how many were linked and the batch id for undo. */
export async function linkAllMatches(): Promise<{ linked: number; batchId: string | null }> {
  const { data, error } = await db.rpc('rr_link_clients', { p_apply: true })
  if (error) throw error
  const rows = ((data || []) as ClientLinkRow[]).filter((r) => r.kind === 'match')
  return { linked: rows.length, batchId: rows[0]?.batch_id ?? null }
}

export async function undoLinkBatch(batchId: string): Promise<number> {
  const { data, error } = await db.rpc('rr_unlink_clients', { p_batch_id: batchId })
  if (error) throw error
  return Number(data) || 0
}
