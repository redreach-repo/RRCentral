import { db, isSupabaseConfigured } from './db'
import { errorCode, isMissingRelationError, isUndefinedColumnError, rawErrorMessage } from './errors'
import { logActivity } from './activity'
import { syncCrmFromQuote } from './crmSync'
import { reserveStockForQuote } from './inventory'
import { loadLineItems } from './lineItems'
import { CLIENT_PO_QUOTE_LINK_SQL, posByQuote, type LinkableQuote } from './clientPoQuoteLink'

/**
 * Client PO <-> quotation link. The rules live in the database
 * (rr_client_po_link_quote / rr_client_po_unlink_quote), so the screens and
 * any later AI tool follow the same ones.
 * SQL: supabase/migrations/20261330090000_client_po_quote_link.sql.
 */

export type PoQuoteLinkResult = {
  po_id: string
  po_number: string
  quote_id: string
  quote_reference: string
  quote_valid_until: string | null
  previous_status: string
  awarded: boolean
  after_expiry: boolean
  days_after_expiry: number | null
  client_mismatch: boolean
}

/** The link functions are not on the database yet. */
export function isPoQuoteLinkSetupMissing(err: unknown): boolean {
  const code = errorCode(err)
  const msg = rawErrorMessage(err, '').toLowerCase()
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    (/rr_client_po_(un)?link_quote/.test(msg) && /could not find|does not exist/.test(msg))
  )
}

function setupError(err: unknown): Error {
  if (isPoQuoteLinkSetupMissing(err)) {
    return new Error(`Linking a PO to a quote needs the database update ${CLIENT_PO_QUOTE_LINK_SQL} run in Supabase first.`)
  }
  return err instanceof Error ? err : new Error(rawErrorMessage(err, 'Could not link the PO to the quote'))
}

export async function linkPoToQuote(poId: string, quoteId: string, award: boolean): Promise<PoQuoteLinkResult> {
  const { data, error } = await db.rpc('rr_client_po_link_quote', { p_po: poId, p_quote: quoteId, p_award: award })
  if (error) throw setupError(error)
  return data as PoQuoteLinkResult
}

export async function unlinkPoQuote(poId: string): Promise<void> {
  const { error } = await db.rpc('rr_client_po_unlink_quote', { p_po: poId })
  if (error) throw setupError(error)
}

const QUOTE_COLUMNS = 'id, client, reference_number, quote_id, status, date, valid_until, amount, quotation_currency, base_reference'

/** Finalized quotes in any status (Expired included) to pick from on a PO. */
export async function listQuotesForLinking(): Promise<LinkableQuote[]> {
  if (!isSupabaseConfigured()) return []
  let res = await db
    .from('quotations')
    .select(`${QUOTE_COLUMNS}, deleted_at`)
    .neq('status', 'Draft')
    .order('date', { ascending: false })
    .limit(1000)
  if (res.error && isUndefinedColumnError(res.error)) {
    res = await db.from('quotations').select(QUOTE_COLUMNS).neq('status', 'Draft').order('date', { ascending: false }).limit(1000)
  }
  if (res.error) throw res.error
  return (res.data || []) as LinkableQuote[]
}

/** PO numbers per quote id, for the Quotations list. Empty until the link SQL is run. */
export async function loadPoNumbersByQuote(): Promise<Map<string, string[]>> {
  if (!isSupabaseConfigured()) return new Map()
  const { data, error } = await db
    .from('client_purchase_orders')
    .select('quotation_id, po_number')
    .not('quotation_id', 'is', null)
    .limit(2000)
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return new Map()
    throw error
  }
  return posByQuote((data || []) as { quotation_id: string | null; po_number: string }[])
}

/**
 * After a PO link marked the quote Awarded: the same follow-ups as setting
 * the outcome by hand (activity log, CRM stage, stock reservation). Best effort.
 */
export async function afterQuoteAwardedByPo(
  quote: Pick<LinkableQuote, 'client' | 'reference_number' | 'quote_id'>,
  poNumber: string,
  who: string,
): Promise<string[]> {
  const problems: string[] = []
  const ref = quote.reference_number || quote.quote_id || ''
  const reason = `Client PO ${poNumber}`
  await logActivity('set_outcome', 'quotation', ref, `Awarded: ${reason}`, who).catch(() => problems.push('activity log'))
  await syncCrmFromQuote({ client: quote.client, quoteRef: quote.reference_number, quoteStatus: 'Awarded', outcomeReason: reason, userEmail: who }).catch(
    () => problems.push('CRM stage'),
  )
  try {
    const lines = await loadLineItems('Quote', quote.quote_id || quote.reference_number)
    await reserveStockForQuote({ lines, quoteRef: ref, userEmail: who })
  } catch {
    problems.push('stock reservation')
  }
  return problems
}
