import { format } from 'date-fns'
import { db } from './db'
import { logActivity } from './activity'
import { isInternalDraftId } from './documents'
import { generateReference } from './referenceNumber'
import { loadLineItems, newDraftLine, toDraftItems, type DraftLineItem } from './lineItems'
import {
  insertDeliveryNote,
  listDeliveryNoteRefs,
  saveDeliveryNoteLineItems,
} from './deliveryNoteStore'
import type { Client, DeliveryNote, LineItem, Quotation } from './types'
import type { QuoteColumnId } from './divisionQuoteFormats'

export const DELIVERY_NOTE_COLUMNS: QuoteColumnId[] = [
  'line',
  'sku',
  'description',
  'sizes',
  'qty',
]

export type PrintableDocType = 'quote' | 'invoice' | 'delivery-note'

export function parseDocumentType(type: string | undefined | null): PrintableDocType {
  const t = String(type || '').toLowerCase().replace(/_/g, '-')
  if (t === 'invoice') return 'invoice'
  if (t === 'delivery-note' || t === 'deliverynote' || t === 'dn') return 'delivery-note'
  return 'quote'
}

export function canCreateDeliveryNoteFromQuote(
  q: Pick<Quotation, 'status' | 'reference_number'>,
): boolean {
  const ref = String(q.reference_number || '').trim()
  if (!ref || isInternalDraftId(ref) || /^INV-DRAFT-/i.test(ref) || /^DN-DRAFT-/i.test(ref)) {
    return false
  }
  const status = String(q.status || '').toLowerCase()
  if (status === 'draft' || status === 'superseded') return false
  return true
}

/** Find a quotation by customer-facing ref (e.g. RR-01-26003) or client name (e.g. Maxtherm). */
export function matchQuoteForDeliveryNote<
  T extends Pick<Quotation, 'client' | 'status' | 'reference_number'>,
>(quotes: T[], query: string): T | undefined {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return undefined
  const eligible = quotes.filter(canCreateDeliveryNoteFromQuote)
  const exactRef = eligible.find((row) => String(row.reference_number || '').toLowerCase() === q)
  if (exactRef) return exactRef
  const exactClient = eligible.find((row) => String(row.client || '').toLowerCase() === q)
  if (exactClient) return exactClient
  const tokens = q.split(/[\s,;/]+/).filter(Boolean)
  return eligible.find((row) => {
    const hay = `${row.reference_number} ${row.client}`.toLowerCase()
    return tokens.every((token) => hay.includes(token))
  })
}

/** Delivery notes copy quote quantities but never prices. */
export function toDeliveryNoteLineDrafts(items: LineItem[]): DraftLineItem[] {
  return toDraftItems(items).map((it) => ({
    ...it,
    unit_price: 0,
    unit_cost: 0,
  }))
}

/** Try quote_id first (how new quotes save lines), then the customer-facing ref. */
export function quoteLineLookupKeys(quote: {
  quote_id?: string
  reference_number?: string
  id?: string
}): string[] {
  const keys: string[] = []
  for (const k of [quote.quote_id, quote.reference_number, quote.id]) {
    const v = String(k || '').trim()
    if (v && !keys.includes(v)) keys.push(v)
  }
  return keys
}

export async function loadQuoteLinesForDeliveryNote(quote: {
  quote_id?: string
  reference_number?: string
  id?: string
}): Promise<LineItem[]> {
  for (const key of quoteLineLookupKeys(quote)) {
    const items = await loadLineItems('Quote', key)
    if (items.some((i) => String(i.description || '').trim() || Number(i.qty))) return items
  }
  return []
}

/** Copy quote lines, or fall back to the quotation description so a note can still print. */
export function draftsFromQuoteLines(
  items: LineItem[],
  quote: Pick<Quotation, 'description'>,
): DraftLineItem[] {
  const real = items.filter((i) => String(i.description || '').trim() || Number(i.qty))
  if (real.length) return toDeliveryNoteLineDrafts(real)
  const desc = String(quote.description || '').trim()
  if (desc) {
    return [newDraftLine({ description: desc, qty: 1, unit_price: 0, unit_cost: 0 })]
  }
  throw new Error('This quotation has no line items to copy onto a delivery note')
}

export function deliveryNoteTotalQty(items: Array<{ qty?: number }>): number {
  return items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
}

export function nextDeliveryNoteReference(
  divisionCode: string,
  existingRefs: string[],
  prefix = 'DN',
): string {
  return generateReference(divisionCode || '01', existingRefs, prefix || 'DN')
}

export function buildDeliveryNoteRow(opts: {
  quote: Pick<
    Quotation,
    | 'client'
    | 'vertical'
    | 'division_code'
    | 'reference_number'
    | 'quote_id'
    | 'description'
    | 'delivery_terms'
    | 'notes'
  >
  referenceNumber: string
  who: string
  shipTo?: string
  date?: string
  status?: string
}): Omit<DeliveryNote, 'id' | 'created_at' | 'updated_at'> {
  const today = opts.date || format(new Date(), 'yyyy-MM-dd')
  return {
    client: opts.quote.client || '',
    vertical: opts.quote.vertical || '',
    division_code: opts.quote.division_code || '01',
    reference_number: opts.referenceNumber,
    date: today,
    delivery_date: today,
    description: opts.quote.description || '',
    quote_ref: opts.quote.reference_number,
    quote_id: opts.quote.quote_id,
    status: opts.status || 'Issued',
    delivery_terms: opts.quote.delivery_terms || '',
    ship_to: opts.shipTo || '',
    notes: opts.quote.notes || '',
    received_by: '',
    vehicle_notes: '',
    created_by: opts.who,
    updated_by: opts.who,
  }
}

export async function createDeliveryNoteFromQuote(opts: {
  quote: Quotation
  who: string
  prefix?: string
  shipTo?: string
}): Promise<DeliveryNote> {
  if (!canCreateDeliveryNoteFromQuote(opts.quote)) {
    throw new Error('Finalize the quotation before creating a delivery note')
  }

  const items = await loadQuoteLinesForDeliveryNote(opts.quote)
  const drafts = draftsFromQuoteLines(items, opts.quote)

  const refs = await listDeliveryNoteRefs()
  const referenceNumber = nextDeliveryNoteReference(
    opts.quote.division_code,
    refs,
    opts.prefix || 'DN',
  )

  let shipTo = opts.shipTo || ''
  if (!shipTo && opts.quote.client) {
    try {
      const { data: clientRow } = await db
        .from('clients')
        .select('address')
        .ilike('company_name', opts.quote.client)
        .maybeSingle()
      shipTo = ((clientRow as Client | null)?.address || '').trim()
    } catch {
      shipTo = ''
    }
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const row = buildDeliveryNoteRow({
    quote: opts.quote,
    referenceNumber,
    who: opts.who,
    shipTo,
  })
  const payload: DeliveryNote = {
    id,
    ...row,
    created_at: now,
    updated_at: now,
  }

  await insertDeliveryNote(payload)
  await saveDeliveryNoteLineItems(referenceNumber, drafts)
  try {
    await logActivity(
      'create_delivery_note',
      'delivery_note',
      referenceNumber,
      `${opts.quote.client} · quote ${opts.quote.reference_number}`,
      opts.who,
    )
  } catch {
    /* Creating the note matters more than the activity row. */
  }
  return payload
}
