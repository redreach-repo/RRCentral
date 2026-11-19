/** Reads and writes client_po_drawdowns (what each invoice took from each client PO line). */
import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import { poLineBalances, poStatusFromBalances, type PoDrawdown } from './clientPoBalance'
import type { PoLineItem } from './clientPoReader'

const COLUMNS = 'id, po_id, po_line_id, invoice_id, quantity, invoices(reference_number, status, date)'

/** Drawdowns for some POs. ready is false while the drawdowns SQL has not been run. */
export async function loadPoDrawdowns(poIds: string[]): Promise<{ rows: PoDrawdown[]; ready: boolean }> {
  if (!isSupabaseConfigured()) return { rows: [], ready: false }
  if (!poIds.length) {
    const { error } = await db.from('client_po_drawdowns').select('id').limit(1)
    if (error) {
      if (isMissingRelationError(error)) return { rows: [], ready: false }
      throw error
    }
    return { rows: [], ready: true }
  }
  const { data, error } = await db.from('client_po_drawdowns').select(COLUMNS).in('po_id', poIds)
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], ready: false }
    throw error
  }
  return {
    rows: ((data || []) as unknown as PoDrawdown[]).map((r) => ({ ...r, quantity: Number(r.quantity) || 0 })),
    ready: true,
  }
}

/** What one invoice took (to reopen it for editing). */
export async function loadInvoiceDrawdowns(invoiceId: string): Promise<PoDrawdown[]> {
  if (!isSupabaseConfigured() || !invoiceId) return []
  const { data, error } = await db.from('client_po_drawdowns').select(COLUMNS).eq('invoice_id', invoiceId)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return ((data || []) as unknown as PoDrawdown[]).map((r) => ({ ...r, quantity: Number(r.quantity) || 0 }))
}

/** Replaces what an invoice takes from client POs with these rows (none = it takes nothing). */
export async function replaceInvoiceDrawdowns(
  invoiceId: string,
  rows: { po_id: string; po_line_id: string; invoice_id: string; quantity: number; created_by: string }[],
): Promise<void> {
  const { error: delError } = await db.from('client_po_drawdowns').delete().eq('invoice_id', invoiceId)
  if (delError) throw delError
  if (!rows.length) return
  const { error } = await db.from('client_po_drawdowns').insert(rows)
  if (error) throw error
}

/**
 * Sets the PO's status from its line balances (open / partial / fulfilled).
 * Leaves a cancelled PO alone, and POs without quantities on their lines.
 */
export async function refreshPoStatusFromLines(poId: string, lines: PoLineItem[]): Promise<void> {
  const { rows, ready } = await loadPoDrawdowns([poId])
  if (!ready) return
  const status = poStatusFromBalances(poLineBalances(lines, rows))
  if (!status) return
  const { error } = await db
    .from('client_purchase_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', poId)
    .neq('status', 'canceled')
  if (error) throw error
}
