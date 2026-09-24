import { VAT_RATE } from './config'
import { db } from './db'
import { formatSizes, parseSizesJson, sumSizes, type SizeBreakdown } from './sizes'
import type { LineItem, LineItemDocType } from './types'

export interface DraftLineItem {
  key: string
  description: string
  qty: number
  unit_price: number
  /** Supplier / landed cost per unit (same currency as unit_price). */
  unit_cost: number
  remarks?: string
  sku?: string
  sizes?: SizeBreakdown | null
}

export function newDraftLine(partial?: Partial<DraftLineItem>): DraftLineItem {
  return {
    key: crypto.randomUUID(),
    description: '',
    qty: 1,
    unit_price: 0,
    unit_cost: 0,
    remarks: '',
    sku: '',
    sizes: null,
    ...partial,
  }
}

export function calcLine(qty: number, unitPrice: number, vatRate = VAT_RATE) {
  const amount = round2(Number(qty || 0) * Number(unitPrice || 0))
  const vat_amount = round2(amount * vatRate)
  const line_total = round2(amount + vat_amount)
  return { amount, vat_amount, line_total, vat_rate: vatRate }
}

export type DiscountOpts = {
  /** Percent off subtotal (0–100). Applied before fixed amount. */
  discountPercent?: number
  /** Fixed amount off subtotal (in document currency). */
  discountAmount?: number
  /**
   * Add VAT to the subtotal, then give that VAT amount as a commercial discount
   * so the customer pays the ex-VAT figure (e.g. 4,535 + 226.75 VAT − 226.75 = 4,535).
   */
  offsetVat?: boolean
}

export const OFFSET_VAT_SETTING_KEY = 'offset_vat_quotes'

export function parseOffsetVatQuoteKeys(raw: string | undefined | null): string[] {
  const text = String(raw || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) return parsed.map((v) => String(v || '').trim()).filter(Boolean)
  } catch {
    /* comma-separated fallback */
  }
  return text
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

export function quoteOffsetsVat(
  quote:
    | {
        offset_vat?: boolean | null
        quote_id?: string
        reference_number?: string
        id?: string
      }
    | null
    | undefined,
  settings?: Record<string, string>,
): boolean {
  if (!quote) return false
  if (quote.offset_vat === true) return true
  const keys = parseOffsetVatQuoteKeys(settings?.[OFFSET_VAT_SETTING_KEY])
  if (!keys.length) return false
  return [quote.quote_id, quote.reference_number, quote.id]
    .map((k) => String(k || '').trim())
    .filter(Boolean)
    .some((k) => keys.includes(k))
}

export function withOffsetVatQuoteKeys(existing: string[], ids: string[], enabled: boolean): string[] {
  const set = new Set(existing)
  for (const id of ids) {
    const key = String(id || '').trim()
    if (!key) continue
    if (enabled) set.add(key)
    else set.delete(key)
  }
  return [...set]
}

/** Discount applied to pre-VAT subtotal. Percent first, then fixed amount. */
export function applyDiscount(
  subtotal: number,
  opts?: DiscountOpts,
): { discount: number; taxable: number } {
  const base = round2(Math.max(0, Number(subtotal) || 0))
  const pct = Math.min(100, Math.max(0, Number(opts?.discountPercent) || 0))
  const fixed = Math.max(0, Number(opts?.discountAmount) || 0)
  const fromPct = round2((base * pct) / 100)
  const discount = round2(Math.min(base, fromPct + fixed))
  return { discount, taxable: round2(Math.max(0, base - discount)) }
}

export function calcTotals(items: DraftLineItem[], vatRate = VAT_RATE, discount?: DiscountOpts) {
  let subtotal = 0
  let cost = 0
  for (const item of items) {
    const qty = item.sizes ? sumSizes(item.sizes) : Number(item.qty) || 0
    const c = calcLine(qty, item.unit_price, vatRate)
    subtotal += c.amount
    cost += round2(qty * (Number(item.unit_cost) || 0))
  }
  subtotal = round2(subtotal)
  cost = round2(cost)
  if (discount?.offsetVat && vatRate > 0) {
    const vat = round2(subtotal * vatRate)
    const profit = round2(subtotal - cost)
    const marginPct = subtotal > 0 ? round2((profit / subtotal) * 100) : 0
    return {
      subtotal,
      discount: vat,
      taxable: subtotal,
      vat,
      total: subtotal,
      cost,
      profit,
      marginPct,
    }
  }
  const { discount: discountValue, taxable } = applyDiscount(subtotal, discount)
  const vat = round2(taxable * vatRate)
  const profit = round2(taxable - cost)
  const marginPct = taxable > 0 ? round2((profit / taxable) * 100) : 0
  return {
    subtotal,
    discount: discountValue,
    taxable,
    vat,
    total: round2(taxable + vat),
    cost,
    profit,
    marginPct,
  }
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function formatMoney(n: number, currency = 'AED'): string {
  return `${currency} ${round2(n).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function effectiveQty(item: DraftLineItem): number {
  if (item.sizes) return sumSizes(item.sizes)
  return Number(item.qty) || 0
}

export function toDraftItems(rows: LineItem[]): DraftLineItem[] {
  if (!rows.length) return [newDraftLine()]
  return rows.map((r) => {
    const sizes = parseSizesJson(r.sizes_json)
    return {
      key: r.id || crypto.randomUUID(),
      description: r.description || '',
      qty: sizes ? sumSizes(sizes) : Number(r.qty) || 0,
      unit_price: Number(r.unit_price) || 0,
      unit_cost: Number(r.unit_cost) || 0,
      remarks: r.remarks || '',
      sku: r.sku || '',
      sizes,
    }
  })
}

export async function loadLineItems(
  docType: LineItemDocType,
  reference: string,
): Promise<LineItem[]> {
  if (!reference) return []
  const { data, error } = await db
    .from('line_items')
    .select('*')
    .eq('doc_type', docType)
    .eq('reference', reference)
    .order('line_no', { ascending: true })
  if (error) throw error
  return (data || []) as LineItem[]
}

export function filterDraftLineItems(items: DraftLineItem[]): DraftLineItem[] {
  return items.filter(
    (i) =>
      i.description.trim() ||
      Number(i.qty) ||
      Number(i.unit_price) ||
      Number(i.unit_cost) ||
      (i.sizes && sumSizes(i.sizes)),
  )
}

export function toPersistedLineItemRows(
  docType: LineItemDocType,
  reference: string,
  items: DraftLineItem[],
  vatRate = VAT_RATE,
) {
  return filterDraftLineItems(items).map((item, idx) => {
    const qty = item.sizes ? sumSizes(item.sizes) : Number(item.qty) || 0
    const c = calcLine(qty, item.unit_price, vatRate)
    const sizeLabel = item.sizes ? formatSizes(item.sizes) : ''
    const remarks = [item.remarks || '', sizeLabel ? `Sizes ${sizeLabel}` : '']
      .filter(Boolean)
      .join(' · ')
    return {
      doc_type: docType,
      reference,
      line_no: idx + 1,
      description: item.description.trim(),
      qty,
      unit_price: Number(item.unit_price) || 0,
      unit_cost: Number(item.unit_cost) || 0,
      vat_rate: c.vat_rate,
      amount: c.amount,
      vat_amount: c.vat_amount,
      line_total: c.line_total,
      remarks,
      sku: item.sku || '',
      sizes_json: item.sizes || null,
    }
  })
}

export async function saveLineItems(
  docType: LineItemDocType,
  reference: string,
  items: DraftLineItem[],
  vatRate = VAT_RATE,
): Promise<void> {
  const { error: deleteError } = await db
    .from('line_items')
    .delete()
    .eq('doc_type', docType)
    .eq('reference', reference)
  if (deleteError) throw deleteError

  const rows = toPersistedLineItemRows(docType, reference, items, vatRate)
  if (!rows.length) return

  const { error } = await db.from('line_items').insert(rows)
  if (error) throw error
}

export async function deleteLineItems(
  docType: LineItemDocType,
  references: string[],
): Promise<void> {
  for (const ref of references) {
    if (!ref) continue
    await db.from('line_items').delete().eq('doc_type', docType).eq('reference', ref)
  }
}

export function makeQuoteId(): string {
  return `Q-${Date.now()}`
}
