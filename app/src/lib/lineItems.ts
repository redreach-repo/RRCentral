import { VAT_RATE } from './config'
import { db } from './db'
import type { LineItem } from './types'

export interface DraftLineItem {
  key: string
  description: string
  qty: number
  unit_price: number
  remarks?: string
}

export function newDraftLine(partial?: Partial<DraftLineItem>): DraftLineItem {
  return {
    key: crypto.randomUUID(),
    description: '',
    qty: 1,
    unit_price: 0,
    remarks: '',
    ...partial,
  }
}

export function calcLine(qty: number, unitPrice: number, vatRate = VAT_RATE) {
  const amount = round2(Number(qty || 0) * Number(unitPrice || 0))
  const vat_amount = round2(amount * vatRate)
  const line_total = round2(amount + vat_amount)
  return { amount, vat_amount, line_total, vat_rate: vatRate }
}

export function calcTotals(items: DraftLineItem[], vatRate = VAT_RATE) {
  let subtotal = 0
  let vat = 0
  for (const item of items) {
    const c = calcLine(item.qty, item.unit_price, vatRate)
    subtotal += c.amount
    vat += c.vat_amount
  }
  return {
    subtotal: round2(subtotal),
    vat: round2(vat),
    total: round2(subtotal + vat),
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

export function toDraftItems(rows: LineItem[]): DraftLineItem[] {
  if (!rows.length) return [newDraftLine()]
  return rows.map((r) => ({
    key: r.id || crypto.randomUUID(),
    description: r.description || '',
    qty: Number(r.qty) || 0,
    unit_price: Number(r.unit_price) || 0,
    remarks: r.remarks || '',
  }))
}

export async function loadLineItems(
  docType: 'Quote' | 'Invoice',
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

export async function saveLineItems(
  docType: 'Quote' | 'Invoice',
  reference: string,
  items: DraftLineItem[],
  vatRate = VAT_RATE,
): Promise<void> {
  await db
    .from('line_items')
    .delete()
    .eq('doc_type', docType)
    .eq('reference', reference)

  const filtered = items.filter(
    (i) => i.description.trim() || Number(i.qty) || Number(i.unit_price),
  )
  if (!filtered.length) return

  const rows = filtered.map((item, idx) => {
    const c = calcLine(item.qty, item.unit_price, vatRate)
    return {
      doc_type: docType,
      reference,
      line_no: idx + 1,
      description: item.description.trim(),
      qty: Number(item.qty) || 0,
      unit_price: Number(item.unit_price) || 0,
      vat_rate: c.vat_rate,
      amount: c.amount,
      vat_amount: c.vat_amount,
      line_total: c.line_total,
      remarks: item.remarks || '',
    }
  })

  const { error } = await db.from('line_items').insert(rows)
  if (error) throw error
}

export async function deleteLineItems(
  docType: 'Quote' | 'Invoice',
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
