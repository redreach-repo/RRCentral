/**
 * Supplier advances: money paid to a vendor before their bill arrives
 * (supabase/migrations/20261331090000_supplier_advances.sql).
 *
 * Every advance belongs to a client PO and its quotation. When the vendor's
 * bill (an Expenses row) arrives, the advance is applied against it. The part
 * not yet applied ("open") is money already out for that job, so it counts as
 * a cost on the day it was paid. Once applied, the bill carries the cost, so
 * nothing is counted twice.
 */
import { formatAED, round2 } from './money'
import type { Expense } from './types'

export type SupplierAdvance = {
  id: string
  vendor_id: string | null
  vendor_name: string
  client_po_id: string
  quotation_id: string | null
  quote_reference: string
  paid_on: string
  amount: number
  currency: string
  payment_method: string
  reference: string
  notes: string
  created_by: string
  created_at: string
}

export type SupplierAdvanceApplication = {
  id: string
  advance_id: string
  expense_id: string
  amount: number
  applied_on: string
  created_by?: string
}

export type AdvanceStatus = 'open' | 'part' | 'applied'

export function appliedToAdvance(advanceId: string, apps: SupplierAdvanceApplication[]): number {
  return round2(apps.filter((a) => a.advance_id === advanceId).reduce((s, a) => s + (Number(a.amount) || 0), 0))
}

/** What is still to be applied to a bill (never below zero). */
export function advanceOpenBalance(adv: Pick<SupplierAdvance, 'id' | 'amount'>, apps: SupplierAdvanceApplication[]): number {
  return Math.max(0, round2((Number(adv.amount) || 0) - appliedToAdvance(adv.id, apps)))
}

export function advanceStatus(adv: Pick<SupplierAdvance, 'id' | 'amount'>, apps: SupplierAdvanceApplication[]): AdvanceStatus {
  const applied = appliedToAdvance(adv.id, apps)
  if (applied <= 0) return 'open'
  return advanceOpenBalance(adv, apps) > 0 ? 'part' : 'applied'
}

export function advanceStatusLabel(s: AdvanceStatus): string {
  return s === 'open' ? 'Open' : s === 'part' ? 'Part applied' : 'Applied'
}

/** How much of a bill is already covered by advances. */
export function coveredOnExpense(expenseId: string, apps: SupplierAdvanceApplication[]): number {
  return round2(apps.filter((a) => a.expense_id === expenseId).reduce((s, a) => s + (Number(a.amount) || 0), 0))
}

/** Largest amount that can be applied from this advance to this bill. */
export function maxApplicable(
  adv: Pick<SupplierAdvance, 'id' | 'amount'>,
  bill: Pick<Expense, 'id' | 'amount'>,
  apps: SupplierAdvanceApplication[],
): number {
  const billLeft = Math.max(0, round2((Number(bill.amount) || 0) - coveredOnExpense(bill.id, apps)))
  return Math.min(advanceOpenBalance(adv, apps), billLeft)
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Bills an advance can be applied to: same vendor name, not canceled or
 * deleted, with something left to cover. Bills on the advance's quote first.
 */
export function billsForAdvance(
  adv: Pick<SupplierAdvance, 'id' | 'amount' | 'vendor_name' | 'quote_reference'>,
  expenses: (Expense & { deleted_at?: string | null })[],
  apps: SupplierAdvanceApplication[],
): (Expense & { left: number })[] {
  return expenses
    .filter((e) => sameName(e.vendor || '', adv.vendor_name) && e.status !== 'Canceled' && !e.deleted_at)
    .map((e) => ({ ...e, left: Math.max(0, round2((Number(e.amount) || 0) - coveredOnExpense(e.id, apps))) }))
    .filter((e) => e.left > 0)
    .sort((a, b) => {
      const qa = adv.quote_reference && a.quote_ref === adv.quote_reference ? 0 : 1
      const qb = adv.quote_reference && b.quote_ref === adv.quote_reference ? 0 : 1
      if (qa !== qb) return qa - qb
      return String(b.date || '').localeCompare(String(a.date || ''))
    })
}

export const ADVANCE_CATEGORY = 'Supplier advance'

/**
 * The open part of each advance as an expense-like row, dated the day it was
 * paid, for the money-out totals (Dashboard, Reports P&L and statement). VAT is
 * zero: an advance has no tax invoice yet, so it stays out of the VAT return.
 */
export function advanceCostRows(advances: SupplierAdvance[], apps: SupplierAdvanceApplication[]): Expense[] {
  const rows: Expense[] = []
  for (const a of advances) {
    const open = advanceOpenBalance(a, apps)
    if (open <= 0) continue
    rows.push({
      id: `advance-${a.id}`,
      date: a.paid_on,
      vendor: a.vendor_name,
      category: ADVANCE_CATEGORY,
      amount: open,
      amount_ex_vat: open,
      vat_amount: 0,
      payment_method: a.payment_method,
      references_text: a.reference,
      notes: a.notes ? `Advance · ${a.notes}` : 'Advance (bill not received yet)',
      status: 'Recorded',
      quote_ref: a.quote_reference,
      supplier_invoice_no: '',
      created_at: a.created_at,
    })
  }
  return rows
}

/** Expenses plus the open part of each advance: what money-out totals should add up. */
export function withAdvanceCosts(expenses: Expense[], advances: SupplierAdvance[], apps: SupplierAdvanceApplication[]): Expense[] {
  return advances.length ? [...expenses, ...advanceCostRows(advances, apps)] : expenses
}

export type PoSupplierCost = {
  /** Every advance paid on this PO. */
  advancesPaid: number
  /** Advances not yet applied to a bill. */
  advancesOpen: number
  /** Vendor bills on the PO's quote (ex VAT when known). */
  bills: number
  /** bills + advancesOpen: supplier money for this job, counted once. */
  supplierCost: number
  /** PO value before VAT. */
  revenue: number
  /** revenue - supplierCost. */
  margin: number
}

/** PO value before VAT: subtotal when known, else amount minus VAT. */
export function poRevenueExVat(po: { amount: number; subtotal?: number | null; vat_amount?: number | null }): number {
  const sub = Number(po.subtotal)
  if (Number.isFinite(sub) && sub > 0) return round2(sub)
  return round2((Number(po.amount) || 0) - (Number(po.vat_amount) || 0))
}

/** Bill cost before VAT when known (VAT on a bill is input VAT, not a cost). */
export function billCostExVat(e: Pick<Expense, 'amount' | 'amount_ex_vat'>): number {
  const ex = Number(e.amount_ex_vat)
  return round2(Number.isFinite(ex) && e.amount_ex_vat != null ? ex : Number(e.amount) || 0)
}

/**
 * Supplier money and margin for one client PO. Bills count when they carry
 * the PO's quote number (Expenses "quote" field) or an advance on this PO was
 * applied to them. Advances count only for their open part.
 */
export function poSupplierCost(
  po: { id: string; amount: number; subtotal?: number | null; vat_amount?: number | null; quote_reference?: string | null },
  advances: SupplierAdvance[],
  apps: SupplierAdvanceApplication[],
  expenses: (Expense & { deleted_at?: string | null })[],
): PoSupplierCost {
  const mine = advances.filter((a) => a.client_po_id === po.id)
  const mineIds = new Set(mine.map((a) => a.id))
  const quoteRefs = new Set(
    [po.quote_reference || '', ...mine.map((a) => a.quote_reference || '')].map((r) => r.trim()).filter(Boolean),
  )
  const appliedBillIds = new Set(apps.filter((a) => mineIds.has(a.advance_id)).map((a) => a.expense_id))
  const bills = expenses
    .filter((e) => e.status !== 'Canceled' && !e.deleted_at)
    .filter((e) => appliedBillIds.has(e.id) || (e.quote_ref && quoteRefs.has(e.quote_ref.trim())))
    .reduce((s, e) => s + billCostExVat(e), 0)
  const advancesPaid = round2(mine.reduce((s, a) => s + (Number(a.amount) || 0), 0))
  const advancesOpen = round2(mine.reduce((s, a) => s + advanceOpenBalance(a, apps), 0))
  const supplierCost = round2(bills + advancesOpen)
  const revenue = poRevenueExVat(po)
  return {
    advancesPaid,
    advancesOpen,
    bills: round2(bills),
    supplierCost,
    revenue,
    margin: round2(revenue - supplierCost),
  }
}

/** Advance totals per client PO id (for the Client POs list). */
export function advancesByPo(advances: SupplierAdvance[], apps: SupplierAdvanceApplication[]): Map<string, { paid: number; open: number }> {
  const out = new Map<string, { paid: number; open: number }>()
  for (const a of advances) {
    const cur = out.get(a.client_po_id) || { paid: 0, open: 0 }
    cur.paid = round2(cur.paid + (Number(a.amount) || 0))
    cur.open = round2(cur.open + advanceOpenBalance(a, apps))
    out.set(a.client_po_id, cur)
  }
  return out
}

export type AdvanceForm = {
  vendor_id: string
  vendor_name: string
  client_po_id: string
  quotation_id: string
  paid_on: string
  amount: string
  payment_method: string
  reference: string
  notes: string
}

/** Check the form before saving; returns an error message or the row to save. */
export function parseAdvanceForm(
  f: AdvanceForm,
  opts: { poHasQuote: boolean; applied?: number },
): { error: string } | { row: Omit<SupplierAdvance, 'id' | 'created_by' | 'created_at' | 'quote_reference' | 'currency'> } {
  const vendor = f.vendor_name.trim()
  if (!vendor) return { error: 'Pick or type the vendor.' }
  if (!f.client_po_id) return { error: 'Pick the client PO this advance is for.' }
  if (!f.quotation_id && !opts.poHasQuote) return { error: 'Pick the quotation this advance is for.' }
  const amount = round2(Number(String(f.amount).replace(/,/g, '')))
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter the amount paid (more than zero).' }
  if (opts.applied && amount < opts.applied) {
    return { error: `This advance is already applied to bills for ${formatAED(opts.applied)}; the amount cannot be less.` }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.paid_on)) return { error: 'Enter the date paid.' }
  return {
    row: {
      vendor_id: f.vendor_id || null,
      vendor_name: vendor,
      client_po_id: f.client_po_id,
      quotation_id: f.quotation_id || null,
      paid_on: f.paid_on,
      amount,
      payment_method: f.payment_method.trim(),
      reference: f.reference.trim(),
      notes: f.notes.trim(),
    },
  }
}
