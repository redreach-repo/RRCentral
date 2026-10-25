import { addDays, format, parseISO } from 'date-fns'
import { hashPortalToken, isPortalToken, newPortalToken } from './clientPortal'
import { DIVISIONS } from './config'
import { contractFromQuote } from './salesPipeline'
import type { ContractInput } from './deliveryStore'
import type { Quotation, SalesDeal } from './types'

/**
 * Quote accept link: the same pattern as the client portal. Each link
 * carries a random token; only its SHA-256 hash is kept
 * (quote_accept_links.token_hash). The link has an expiry date and can be
 * turned off. Shared by the app and the quote-accept Edge Function (bundled
 * by app/scripts/build-support-function.mjs). Only pure modules are imported.
 *
 * When the client accepts (typing their name and the date):
 *  - the quote moves to Accepted, and the name, date, address and time are kept;
 *  - the AI CRM deal with this quote moves to Signed with a DRAFT contract
 *    made from the quote, which bills nothing until someone activates it;
 *  - an open CRM lead for the client moves to Won.
 * Nothing financial happens: a person still marks the quote Awarded,
 * raises the invoice and activates the contract.
 */

export { hashPortalToken as hashAcceptToken, isPortalToken as isAcceptToken, newPortalToken as newAcceptToken }

/** A link works for this long when the quote has no valid until date in the future. */
export const ACCEPT_LINK_DAYS = 30
/** Largest quote PDF a link can carry (base64 characters, about 6 MB of PDF). */
export const ACCEPT_PDF_MAX_CHARS = 8_000_000

/** Quotes a client can be sent an accept link for. */
export function canHaveAcceptLink(q: Pick<Quotation, 'status' | 'reference_number'>): boolean {
  return Boolean(q.reference_number) && (q.status === 'Finalized' || q.status === 'Sent')
}

/** Quotes a client may still accept through a link. */
export function acceptableStatus(status: string): boolean {
  return status === 'Finalized' || status === 'Sent'
}

/** End of the quote's valid until day when that is still ahead, else 30 days from now. */
export function acceptLinkExpiry(validUntil: string | null | undefined, now: Date = new Date()): string {
  if (validUntil) {
    const end = new Date(`${validUntil.slice(0, 10)}T23:59:59.000Z`)
    if (!Number.isNaN(end.getTime()) && end.getTime() > now.getTime()) return end.toISOString()
  }
  return addDays(now, ACCEPT_LINK_DAYS).toISOString()
}

/** The link the client opens. The token sits after # so it never reaches a server log. */
export function acceptLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/accept#${token}`
}

export type AcceptLinkRow = {
  id: string
  quotation_id: string
  label: string
  created_by: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_opened_at: string | null
  accepted_at: string | null
  accepted_name: string
}

export type AcceptLinkState = 'accepted' | 'revoked' | 'expired' | 'active'

export function acceptLinkState(
  row: Pick<AcceptLinkRow, 'accepted_at' | 'revoked_at' | 'expires_at'>,
  now: Date = new Date(),
): AcceptLinkState {
  if (row.accepted_at) return 'accepted'
  if (row.revoked_at) return 'revoked'
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) return 'expired'
  return 'active'
}

export const ACCEPT_STATE_LABELS: Record<AcceptLinkState, string> = {
  accepted: 'Accepted',
  revoked: 'Turned off',
  expired: 'Expired',
  active: 'Working',
}

/** What the client sees on the accept page: the quote's headline, nothing internal. */
export type AcceptView = {
  state: AcceptLinkState | 'closed'
  reference: string
  client: string
  brand: string
  date: string
  validUntil: string
  amount: number
  currency: string
  description: string
  hasPdf: boolean
  acceptedName: string
  acceptedAt: string
}

export function acceptView(
  quote: Pick<Quotation, 'reference_number' | 'client' | 'division_code' | 'date' | 'valid_until' | 'amount' | 'status' | 'description'> & {
    quotation_currency?: string
    currency?: string
  },
  link: Pick<AcceptLinkRow, 'accepted_at' | 'accepted_name' | 'revoked_at' | 'expires_at'> & { has_pdf: boolean },
  now: Date = new Date(),
): AcceptView {
  const state = acceptLinkState(link, now)
  return {
    // A quote that was revised, lost or expired in the app cannot be accepted any more.
    state: state === 'active' && !acceptableStatus(quote.status) ? 'closed' : state,
    reference: quote.reference_number,
    client: quote.client,
    brand: DIVISIONS.find((d) => d.code === quote.division_code)?.brand ?? 'Red Reach',
    date: quote.date || '',
    validUntil: quote.valid_until || '',
    amount: Number(quote.amount) || 0,
    currency: quote.quotation_currency || quote.currency || 'AED',
    description: String(quote.description || '').slice(0, 2000),
    hasPdf: link.has_pdf,
    acceptedName: link.accepted_name || '',
    acceptedAt: link.accepted_at || '',
  }
}

/** The client's acceptance: their full name and the date they sign for. */
export function acceptProblem(input: { name: string; date: string; agreed: boolean }, now: Date = new Date()): string | null {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 200) return 'Type your full name'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Pick the date'
  const d = parseISO(input.date)
  if (Number.isNaN(d.getTime())) return 'Pick the date'
  const today = format(now, 'yyyy-MM-dd')
  if (input.date > today || input.date < format(addDays(now, -7), 'yyyy-MM-dd')) return 'Use today’s date or one from the last week'
  if (!input.agreed) return 'Tick the box to accept the quote'
  return null
}

/**
 * The contract the accepted quote becomes: the deal's quote, saved as a
 * draft so it bills nothing until a person activates it.
 */
export function draftContractFromAcceptedDeal(
  deal: Pick<
    SalesDeal,
    'package_id' | 'option' | 'monthly_fee' | 'setup_fee' | 'discount_percent' | 'discount_months' | 'start_date' | 'quote_reference'
  >,
  acceptedBy: string,
  now: Date = new Date(),
): ContractInput {
  const c = contractFromQuote(deal, now)
  return {
    ...c,
    status: 'draft',
    auto_invoice: false,
    notes: `${c.notes} Accepted online by ${acceptedBy.trim()}. Draft: check and activate it to start billing.`,
  }
}

/** The AI CRM deal an accepted quote belongs to: the open deal with this quote reference. */
export function dealForQuote<T extends Pick<SalesDeal, 'id' | 'stage' | 'quote_reference' | 'contract_id'>>(
  deals: T[],
  quote: Pick<Quotation, 'reference_number' | 'base_reference'>,
): T | undefined {
  const refs = new Set([quote.reference_number, quote.base_reference].map((r) => String(r || '').trim()).filter(Boolean))
  return deals.find((d) => d.stage !== 'signed' && d.stage !== 'lost' && !d.contract_id && refs.has(d.quote_reference.trim()))
}

/** Who can make and turn off accept links: the people who work on quotes. */
export function canManageAcceptLinks(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'sales'
}

/** Who sees the full acceptance record (name, date, address and time). */
export function canSeeAcceptance(role: string | null | undefined): boolean {
  return role === 'admin'
}
