import { appBaseUrl } from './clientPortalStore'
import { db } from './db'
import { isMissingRelationError } from './errors'
import {
  ACCEPT_PDF_MAX_CHARS,
  acceptLink,
  acceptLinkExpiry,
  hashAcceptToken,
  isAcceptToken,
  newAcceptToken,
  type AcceptLinkRow,
  type AcceptView,
} from './quoteAccept'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { Quotation } from './types'

const NOT_VALID = 'This link does not work any more. Ask Red Reach for a new one.'
const LINK_COLUMNS = 'id, quotation_id, label, created_by, created_at, expires_at, revoked_at, last_opened_at, accepted_at, accepted_name'

export type QuoteAcceptance = {
  id: string
  accepted_name: string
  accepted_date: string
  accepted_at: string
  ip: string
  user_agent: string
  sales_deal_id: string | null
  contract_id: string | null
  crm_id: string
}

export async function listAcceptLinks(quotationId: string): Promise<{ rows: AcceptLinkRow[]; missingTable: boolean }> {
  const { data, error } = await db
    .from('quote_accept_links')
    .select(LINK_COLUMNS)
    .eq('quotation_id', quotationId)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as AcceptLinkRow[], missingTable: false }
}

/** The full acceptance records for a quote. RLS only returns them to admins. */
export async function listAcceptances(quotationId: string): Promise<QuoteAcceptance[]> {
  const { data, error } = await db.from('quote_acceptances').select('*').eq('quotation_id', quotationId)
  if (error) return []
  return (data || []) as QuoteAcceptance[]
}

/** Base64 of a PDF data URL (data:application/pdf;...;base64,XXXX). */
export function pdfBase64FromDataUrl(dataUrl: string): string {
  const at = dataUrl.indexOf('base64,')
  return at >= 0 ? dataUrl.slice(at + 7) : ''
}

/** Makes a link for a quote, carrying the PDF as it is now. Returns the link to send. */
export async function createAcceptLink(
  quote: Pick<Quotation, 'id' | 'valid_until' | 'reference_number'>,
  pdfBase64: string,
  label: string,
  by: string,
): Promise<string> {
  if (!pdfBase64) throw new Error('The PDF could not be made. Try again.')
  if (pdfBase64.length > ACCEPT_PDF_MAX_CHARS) throw new Error('The PDF is too large for a link (over 6 MB).')
  const token = newAcceptToken()
  const id = crypto.randomUUID()
  const { error } = await db.from('quote_accept_links').insert({
    id,
    quotation_id: quote.id,
    label: label.trim().slice(0, 200),
    token_hash: await hashAcceptToken(token),
    pdf_name: `${quote.reference_number || 'quote'}.pdf`,
    created_by: by,
    created_at: new Date().toISOString(),
    expires_at: acceptLinkExpiry(quote.valid_until),
    revoked_at: null,
    last_opened_at: null,
    accepted_at: null,
    accepted_name: '',
  })
  if (error) throw error
  const { error: pdfError } = await db.from('quote_accept_pdfs').insert({ link_id: id, pdf_base64: pdfBase64 })
  if (pdfError) {
    await db.from('quote_accept_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    throw pdfError
  }
  return acceptLink(appBaseUrl(), token)
}

export async function revokeAcceptLink(id: string): Promise<void> {
  const { error } = await db.from('quote_accept_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export type AcceptResult<T> = { ok: true; data: T } | { ok: false; message: string }

/** Calls the quote-accept function from the client's page. */
export async function callQuoteAccept<T = AcceptView>(token: string, body: Record<string, unknown> = {}): Promise<AcceptResult<T>> {
  if (!isAcceptToken(token)) return { ok: false, message: NOT_VALID }
  if (!isSupabaseConfigured()) return { ok: false, message: 'Accept links only work when RR Central is connected to the cloud.' }
  const { data, error } = await getSupabaseClient().functions.invoke('quote-accept', { body: { token, ...body } })
  if (error) {
    let message = 'The page could not load. Please try again later.'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) message = String(b.error)
    } catch {
      // keep the plain message
    }
    return { ok: false, message }
  }
  return { ok: true, data: data as T }
}
