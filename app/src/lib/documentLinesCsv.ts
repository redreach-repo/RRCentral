/** Document (quote / invoice / DN) line-item CSV column map — matches DocumentPage Export CSV. */

import type { ColumnMap } from './listIo'
import { newDraftLine, type DraftLineItem } from './lineItems'

export const DOCUMENT_LINES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'line_no', label: 'line_no' },
  { key: 'description', label: 'description', required: true },
  { key: 'sku', label: 'sku' },
  { key: 'qty', label: 'qty' },
  { key: 'unit_price', label: 'unit_price' },
  { key: 'unit_cost', label: 'unit_cost' },
  { key: 'vat_rate', label: 'vat_rate' },
  { key: 'amount', label: 'amount' },
  { key: 'vat_amount', label: 'vat_amount' },
  { key: 'line_total', label: 'line_total' },
  { key: 'remarks', label: 'remarks' },
]

export const DOCUMENT_LINES_CSV_HEADERS = DOCUMENT_LINES_CSV_COLUMNS.map((c) => c.key)

/** Map a validated CSV row into a draft line (amounts recalculated on save). */
export function documentLineRowToDraft(row: Record<string, string>): DraftLineItem {
  const qty = Number(row.qty)
  const unit_price = Number(row.unit_price)
  const unit_cost = Number(row.unit_cost)
  return newDraftLine({
    description: String(row.description || '').trim(),
    sku: String(row.sku || '').trim(),
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit_price: Number.isFinite(unit_price) ? unit_price : 0,
    unit_cost: Number.isFinite(unit_cost) ? unit_cost : 0,
    remarks: String(row.remarks || '').trim(),
  })
}
