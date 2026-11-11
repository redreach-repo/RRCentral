/**
 * Persist an Ask RR quotation proposal as a Draft (never Finalized).
 * The salesperson must confirm in the UI before this runs.
 */

import { format } from 'date-fns'
import { DIVISIONS, VAT_RATE } from './config'
import { quotationCurrencyDefaults } from './customerPayments'
import { db } from './db'
import { isUndefinedColumnError } from './errors'
import { calcTotals, makeQuoteId, newDraftLine, saveLineItems } from './lineItems'
import { logActivity } from './activity'
import { registerLineItemSkus } from './skuRegistry'
import type { AskQuoteDraft } from './aiAssist'
import type { CrmEntry } from './types'

export type AskDraftQuoteDefaults = {
  paymentTerms?: string
  deliveryTerms?: string
  moq?: string
  vatRate?: number
}

export type AskDraftQuoteResult = {
  quoteId: string
  /** Database row id for /document/quote/:id links. */
  rowId: string | null
  client: string
  amount: number
}

function divisionBrand(code: string): string {
  return DIVISIONS.find((d) => d.code === code)?.brand || DIVISIONS[0].brand
}

/** Prefer an exact / close company name already in the loaded CRM. */
export function resolveAskQuoteClient(proposed: string, entries: CrmEntry[]): string {
  const want = proposed.trim().toLowerCase()
  if (!want) return proposed.trim()
  const exact = entries.find((e) => (e.company_name || '').trim().toLowerCase() === want)
  if (exact?.company_name) return exact.company_name.trim()
  const starts = entries.find((e) => (e.company_name || '').trim().toLowerCase().startsWith(want))
  if (starts?.company_name) return starts.company_name.trim()
  const contains = entries.find((e) => (e.company_name || '').trim().toLowerCase().includes(want))
  if (contains?.company_name) return contains.company_name.trim()
  return proposed.trim()
}

export async function createAskDraftQuote(args: {
  proposal: AskQuoteDraft
  entries: CrmEntry[]
  who: string
  defaults?: AskDraftQuoteDefaults
}): Promise<AskDraftQuoteResult> {
  const division =
    DIVISIONS.some((d) => d.code === args.proposal.division_code) ? args.proposal.division_code : '01'
  const client = resolveAskQuoteClient(args.proposal.client, args.entries)
  if (!client) throw new Error('Add a client name before creating the draft quotation.')

  const items = args.proposal.items
    .map((i) =>
      newDraftLine({
        description: i.description,
        qty: i.qty,
        unit_price: i.unit_price,
        unit_cost: Math.max(0, Number(i.unit_cost) || 0),
      }),
    )
    .filter((i) => i.description.trim() && i.qty > 0)

  if (!items.length) throw new Error('Add at least one line item before creating the draft quotation.')

  const vatRate = Number(args.defaults?.vatRate) || VAT_RATE
  const totals = calcTotals(items, vatRate)
  const quoteId = makeQuoteId()
  const who = args.who || 'ask-rr'
  const vertical = divisionBrand(division)
  const currencyFields = quotationCurrencyDefaults({
    base_amount: totals.total,
    fx_rate_approved_by: who,
    fx_rate_approved_at: new Date().toISOString(),
  })

  const insertRow = {
    ...currencyFields,
    client,
    vertical,
    division_code: division,
    description: args.proposal.description.trim() || `Quotation for ${client}`,
    payment_terms: args.defaults?.paymentTerms || '',
    delivery_terms: args.defaults?.deliveryTerms || '',
    moq: args.defaults?.moq || '',
    notes: args.proposal.notes.trim(),
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: totals.total,
    discount_percent: 0,
    discount_amount: 0,
    offset_vat: false,
    quote_id: quoteId,
    status: 'Draft',
    reference_number: '',
    base_reference: '',
    revision: 0,
    created_by: who,
    updated_by: who,
    updated_at: new Date().toISOString(),
  }

  const { error } = await db.from('quotations').insert(insertRow)
  if (error && isUndefinedColumnError(error)) {
    const { offset_vat: _omit, ...withoutFlag } = insertRow
    const retry = await db.from('quotations').insert(withoutFlag)
    if (retry.error) throw retry.error
  } else if (error) {
    throw error
  }

  const registered = await registerLineItemSkus(items, division, `quotation ${quoteId}`)
  await saveLineItems('Quote', quoteId, registered.items, vatRate)
  await logActivity('save_quote', 'quotation', 'DRAFT', `${client} · Draft (Ask RR)`, who)

  let rowId: string | null = null
  const found = await db.from('quotations').select('id').eq('quote_id', quoteId).maybeSingle()
  if (!found.error && found.data?.id) rowId = String(found.data.id)

  return { quoteId, rowId, client, amount: totals.total }
}
