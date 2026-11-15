import {
  add, decimalToString, decMul, lineMoney, maxZero, min, money, moneyOrZero, multiply, percentOf, pow10, roundAmount, roundToScale, sub, toDecimalOrZero,
  toNumber, zero, type Money,
} from './money/index'
import { VAT_RATE } from './config'
import { db } from './db'
import { isUndefinedColumnError } from './errors'
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
  /** Optional product image data URL / https. Empty = omit on printable quote. */
  image_data?: string
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
    image_data: '',
    ...partial,
  }
}

export function calcLine(qty: number, unitPrice: number, vatRate = VAT_RATE, currency = 'AED') {
  const l = lineMoney(toDecimalOrZero(qty), toDecimalOrZero(unitPrice), toDecimalOrZero(vatRate), currency)
  return { amount: toNumber(l.amount), vat_amount: toNumber(l.vat), line_total: toNumber(l.total), vat_rate: vatRate }
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
  const r = applyDiscountMoney(moneyOrZero(subtotal, 'AED'), opts)
  return { discount: toNumber(r.discount), taxable: toNumber(r.taxable) }
}

/** Exact discount: percent of the subtotal (rounded), plus a fixed amount, never more than the subtotal. */
export function applyDiscountMoney(subtotal: Money, opts?: DiscountOpts): { discount: Money; taxable: Money } {
  const base = maxZero(subtotal)
  const pctDec = toDecimalOrZero(opts?.discountPercent)
  const pct = pctDec.coef < 0n ? 0 : pctDec.coef > 100n * pow10(pctDec.scale) ? 100 : pctDec
  const fixed = maxZero(moneyOrZero(opts?.discountAmount, base.currency))
  const fromPct = multiply(base, decMul(pct, '0.01'))
  const discount = min(base, add(fromPct, fixed))
  return { discount, taxable: maxZero(sub(base, discount)) }
}

export function calcTotals(items: DraftLineItem[], vatRate = VAT_RATE, discount?: DiscountOpts, currency = 'AED') {
  const t = calcTotalsMoney(items, vatRate, discount, currency)
  return {
    subtotal: toNumber(t.subtotal),
    discount: toNumber(t.discount),
    taxable: toNumber(t.taxable),
    vat: toNumber(t.vat),
    total: toNumber(t.total),
    cost: toNumber(t.cost),
    profit: toNumber(t.profit),
    marginPct: t.marginPct,
  }
}

/** Document totals in exact money. Line amounts are rounded per line, then summed (no drift). */
export function calcTotalsMoney(items: DraftLineItem[], vatRate: number | string = VAT_RATE, discount?: DiscountOpts, currency = 'AED') {
  const rate = toDecimalOrZero(vatRate)
  let subtotal = zero(currency)
  let cost = zero(currency)
  for (const item of items) {
    const qty = item.sizes ? sumSizes(item.sizes) : item.qty
    subtotal = add(subtotal, lineMoney(toDecimalOrZero(qty), toDecimalOrZero(item.unit_price), rate, currency).amount)
    cost = add(cost, money(decMul(toDecimalOrZero(qty), toDecimalOrZero(item.unit_cost)), currency))
  }
  if (discount?.offsetVat && rate.coef > 0n) {
    const vat = multiply(subtotal, rate)
    const profit = sub(subtotal, cost)
    return {
      subtotal, discount: vat, taxable: subtotal, vat, total: subtotal, cost, profit,
      marginPct: subtotal.minor > 0n ? percentOf(profit, subtotal) : 0,
    }
  }
  const { discount: discountValue, taxable } = applyDiscountMoney(subtotal, discount)
  const vat = multiply(taxable, rate)
  const profit = sub(taxable, cost)
  return {
    subtotal, discount: discountValue, taxable, vat, total: add(taxable, vat), cost, profit,
    marginPct: taxable.minor > 0n ? percentOf(profit, taxable) : 0,
  }
}

/** Exact 2-place rounding (half away from zero, same as Postgres round()). */
export function round2(n: number): number {
  return roundAmount(n, 'AED')
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

/** Parse a typed money amount (commas allowed). Returns null if empty or invalid. */
export function parseMoneyInput(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? round2(raw) : null
  const text = String(raw ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim()
  if (!text) return null
  const n = Number(text)
  if (!Number.isFinite(n) || n <= 0) return null
  return round2(n)
}

/**
 * Rewrite exclusive unit prices so the quoted total (subtotal + VAT, no discount)
 * equals `inclusiveTarget`. Omit the target to keep today's exclusive subtotal as
 * the amount they pay, including VAT. Line shares stay proportional.
 */
export function foldVatIntoUnitPrices(
  items: DraftLineItem[],
  vatRate = VAT_RATE,
  inclusiveTarget?: number | null,
) {
  const rate = Math.max(0, Number(vatRate) || 0)
  const rows = items.map((item) => {
    const qty = effectiveQty(item)
    const amount = round2(qty * (Number(item.unit_price) || 0))
    return { item, qty, amount }
  })
  const sourceTotal = round2(rows.reduce((sum, row) => sum + row.amount, 0))
  const requested = Number(inclusiveTarget)
  const target =
    Number.isFinite(requested) && requested > 0 ? round2(requested) : sourceTotal

  const snapshot = (next: DraftLineItem[], changed: boolean) => {
    const after = calcTotals(next, rate)
    return {
      items: next,
      inclusiveTotal: target,
      exclusiveSubtotal: after.subtotal,
      vat: after.vat,
      total: after.total,
      changed,
      matched: after.total === target,
    }
  }
  if (target <= 0 || sourceTotal <= 0) return snapshot(items, false)

  const current = calcTotals(items, rate)
  if (current.total === target && current.discount === 0) return snapshot(items, false)

  const exclusiveTarget = rate > 0 ? round2(target / (1 + rate)) : target
  const adjustable = rows
    .map((row, idx) => (row.qty > 0 && row.amount > 0 ? idx : -1))
    .filter((idx) => idx >= 0)
  if (!adjustable.length) return snapshot(items, false)

  const exclByIndex = rows.map(() => 0)
  let allocated = 0
  adjustable.forEach((idx, j) => {
    const isLast = j === adjustable.length - 1
    const excl = isLast
      ? round2(exclusiveTarget - allocated)
      : round2((rows[idx].amount / sourceTotal) * exclusiveTarget)
    if (!isLast) allocated += excl
    exclByIndex[idx] = Math.max(0, excl)
  })

  const applyExcl = (excl: number[]) =>
    items.map((item, i) => {
      const qty = rows[i].qty
      const amount = excl[i]
      if (qty <= 0 || amount <= 0) return item
      return { ...item, unit_price: amount / qty }
    })

  let next = applyExcl(exclByIndex)
  let after = calcTotals(next, rate)
  const last = adjustable[adjustable.length - 1]
  for (let i = 0; i < 80 && after.total !== target; i++) {
    const dir = after.total < target ? 1 : -1
    exclByIndex[last] = round2(Math.max(0, exclByIndex[last] + dir * 0.01))
    next = applyExcl(exclByIndex)
    after = calcTotals(next, rate)
  }

  const changed = next.some((item, i) => Math.abs((item.unit_price || 0) - (items[i].unit_price || 0)) > 1e-9)
  return snapshot(next, changed)
}

/**
 * VAT rate a saved document was issued with, read back from its line items
 * (e.g. 0 for a company outside the UAE, or a custom rate). Falls back when
 * there are no lines or the lines disagree.
 */
export function savedVatRate(rows: Pick<LineItem, 'vat_rate'>[], fallback = VAT_RATE): number {
  if (!rows.length) return fallback
  const rates = rows.map((r) => (r.vat_rate == null ? NaN : Number(r.vat_rate)))
  const first = rates[0]
  const valid = Number.isFinite(first) && first >= 0 && first < 1
  return valid && rates.every((r) => Math.abs(r - first) < 1e-9) ? first : fallback
}

/** "5" → 0.05; blank, negative or ≥100 → fallback. */
export function vatPercentToRate(percent: string | number, fallback = VAT_RATE): number {
  const n = Number(percent)
  if (String(percent).trim() === '' || !Number.isFinite(n) || n < 0 || n >= 100) return fallback
  return Number(decimalToString({ coef: roundToScale(String(percent).trim(), 3), scale: 5 }))
}

/** 0.05 → "5" (trailing zeros trimmed). */
export function vatRateToPercent(rate: number): string {
  return String(Number(decimalToString({ coef: roundToScale(toDecimalOrZero(rate), 5), scale: 3 })))
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
      image_data: String(r.image_data || '').trim(),
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
      image_data: String(item.image_data || '').trim(),
    }
  })
}

export type SaveLineItemsResult = {
  /** True when images were dropped because `line_items.image_data` is missing in the DB. */
  imagesDropped: boolean
}

export async function saveLineItems(
  docType: LineItemDocType,
  reference: string,
  items: DraftLineItem[],
  vatRate = VAT_RATE,
): Promise<SaveLineItemsResult> {
  const { error: deleteError } = await db
    .from('line_items')
    .delete()
    .eq('doc_type', docType)
    .eq('reference', reference)
  if (deleteError) throw deleteError

  const rows = toPersistedLineItemRows(docType, reference, items, vatRate)
  if (!rows.length) return { imagesDropped: false }

  const hadImages = rows.some((r) => Boolean(String(r.image_data || '').trim()))
  const { error } = await db.from('line_items').insert(rows)
  if (!error) return { imagesDropped: false }
  // Until migration `line_item_image` is applied, save without image_data.
  if (isUndefinedColumnError(error)) {
    const stripped = rows.map(({ image_data: _image, ...rest }) => rest)
    const { error: retryError } = await db.from('line_items').insert(stripped)
    if (retryError) throw retryError
    return { imagesDropped: hadImages }
  }
  throw error
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
