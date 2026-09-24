import { format } from 'date-fns'
import { db } from './db'
import { logActivity } from './activity'
import { generateReference } from './referenceNumber'
import { loadLineItems, saveLineItems, toDraftItems, type DraftLineItem } from './lineItems'
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
  if (!String(q.reference_number || '').trim()) return false
  return ['Finalized', 'Sent', 'Awarded'].includes(q.status)
}

/** Delivery notes copy quote quantities but never prices. */
export function toDeliveryNoteLineDrafts(items: LineItem[]): DraftLineItem[] {
  return toDraftItems(items).map((it) => ({
    ...it,
    unit_price: 0,
    unit_cost: 0,
  }))
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

  const items = await loadLineItems('Quote', opts.quote.quote_id)
  const drafts = toDeliveryNoteLineDrafts(items)

  const { data: existing, error: listErr } = await db.from('delivery_notes').select('reference_number')
  if (listErr) throw listErr
  const refs = ((existing || []) as { reference_number?: string }[]).map((r) => r.reference_number || '')
  const referenceNumber = nextDeliveryNoteReference(
    opts.quote.division_code,
    refs,
    opts.prefix || 'DN',
  )

  let shipTo = opts.shipTo || ''
  if (!shipTo && opts.quote.client) {
    const { data: clientRow } = await db
      .from('clients')
      .select('address')
      .ilike('company_name', opts.quote.client)
      .maybeSingle()
    shipTo = ((clientRow as Client | null)?.address || '').trim()
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

  const { error } = await db.from('delivery_notes').insert(payload)
  if (error) throw error

  await saveLineItems('DeliveryNote', referenceNumber, drafts, 0)
  await logActivity(
    'create_delivery_note',
    'delivery_note',
    referenceNumber,
    `${opts.quote.client} · quote ${opts.quote.reference_number}`,
    opts.who,
  )
  return payload
}
