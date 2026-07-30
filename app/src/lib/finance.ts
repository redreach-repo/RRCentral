import { format, parseISO, startOfMonth } from 'date-fns'
import type { Expense, IncomeEntry, Invoice } from './types'

const LOST_STATUSES = new Set(['not awarded', 'not_awarded', 'lost', 'cancelled', 'canceled'])

export function isCancelledInvoice(inv: Pick<Invoice, 'status'> | { status?: string }): boolean {
  return String(inv.status || '').trim().toLowerCase() === 'cancelled'
}

/**
 * Cancelled invoices are never collectible/paid — clear stale "Paid" badges
 * left behind when status was set to Cancelled after a mistaken payment mark.
 */
export function effectiveInvoicePaymentStatus(
  inv: Pick<Invoice, 'status' | 'payment_status'> | { status?: string; payment_status?: string },
): string {
  if (isCancelledInvoice(inv)) return 'Pending'
  return String(inv.payment_status || 'Pending')
}

/** True when an income row should count as real revenue (invoiced & paid / awarded). */
export function isRecognizedIncome(row: IncomeEntry): boolean {
  const status = String(row.status || '').trim().toLowerCase()
  const pay = String(row.payment_status || '').trim().toLowerCase()
  if (LOST_STATUSES.has(status)) return false
  if (pay === 'pending' || pay === 'unpaid') return false
  // Historical sheet rows often only set payment_status=Paid
  if (pay === 'paid' || pay === 'partial') return true
  if (status === 'awarded' && pay !== 'pending') return true
  return false
}

/**
 * Dashboard/report income: never count rows tied to a cancelled invoice, and only
 * count invoice-linked rows when that invoice is actually Paid/Partial.
 * Historical sheet income (no matching invoice) still uses isRecognizedIncome,
 * unless the invoice ref was deleted.
 */
export function countsTowardIncome(
  row: IncomeEntry,
  invoices: Array<Pick<Invoice, 'reference_number' | 'status' | 'payment_status'>>,
  deletedInvoiceRefs?: Set<string> | string[],
): boolean {
  if (!isRecognizedIncome(row)) return false
  const ref = String(row.reference_number || '').trim()
  if (!ref) return true

  const deleted =
    deletedInvoiceRefs instanceof Set
      ? deletedInvoiceRefs
      : new Set((deletedInvoiceRefs || []).map((r) => String(r || '').trim()).filter(Boolean))
  if (deleted.has(ref)) return false

  const inv = invoices.find((i) => String(i.reference_number || '').trim() === ref)
  if (!inv) return true
  if (isCancelledInvoice(inv)) return false
  const pay = effectiveInvoicePaymentStatus(inv).toLowerCase()
  return pay === 'paid' || pay === 'partial'
}

export function sumRecognizedIncome(
  rows: IncomeEntry[],
  invoices?: Array<Pick<Invoice, 'reference_number' | 'status' | 'payment_status'>>,
  deletedInvoiceRefs?: Set<string> | string[],
): number {
  const filtered = invoices
    ? rows.filter((r) => countsTowardIncome(r, invoices, deletedInvoiceRefs))
    : rows.filter(isRecognizedIncome)
  return filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0)
}

/** Active (non-cancelled) invoices that are still collectible. */
export function isOpenInvoice(inv: Invoice): boolean {
  if (isCancelledInvoice(inv)) return false
  if (String(inv.status || '').toLowerCase() === 'draft') return false
  const pay = String(inv.payment_status || '').toLowerCase()
  return ['pending', 'partial', 'overdue'].includes(pay)
}

export function monthKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const s = String(dateStr).slice(0, 10)
  if (!/^\d{4}-\d{2}/.test(s)) return null
  return s.slice(0, 7)
}

export function isInMonth(dateStr: string | null | undefined, month = startOfMonth(new Date())): boolean {
  const key = monthKey(dateStr)
  return key === format(month, 'yyyy-MM')
}

export function sumExpenses(rows: Expense[]): number {
  return rows.reduce((s, r) => s + Number(r.amount || 0), 0)
}

/** Sort by business date descending (latest month/day first); nulls last. */
export function sortByDateDesc<T extends { date?: string | null; created_at?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.date || a.created_at || ''
    const db = b.date || b.created_at || ''
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return db.localeCompare(da)
  })
}

export type VatQuarter = 1 | 2 | 3 | 4

export function quarterMonths(year: number, quarter: VatQuarter): string[] {
  const start = (quarter - 1) * 3 + 1
  return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, '0')}`)
}

export function currentVatQuarter(d = new Date()): { year: number; quarter: VatQuarter } {
  const month = d.getMonth() + 1
  const quarter = (Math.ceil(month / 3) as VatQuarter)
  return { year: d.getFullYear(), quarter }
}

/**
 * UAE-style VAT line: prefer explicit vat/bill_amount; else back-calc 5% from total (VAT-inclusive).
 */
export function incomeVatParts(row: IncomeEntry, vatRate = 0.05): { exclusive: number; vat: number; inclusive: number } {
  const total = Number(row.total_amount || 0)
  const bill = Number(row.bill_amount || 0)
  const vat = Number(row.vat || 0)
  if (bill > 0 || vat > 0) {
    const exclusive = bill > 0 ? bill : Math.max(0, total - vat)
    const vatAmt = vat > 0 ? vat : Math.round(exclusive * vatRate * 100) / 100
    const inclusive = total > 0 ? total : exclusive + vatAmt
    return { exclusive, vat: vatAmt, inclusive }
  }
  if (total <= 0) return { exclusive: 0, vat: 0, inclusive: 0 }
  const exclusive = Math.round((total / (1 + vatRate)) * 100) / 100
  const vatAmt = Math.round((total - exclusive) * 100) / 100
  return { exclusive, vat: vatAmt, inclusive: total }
}

/** Assume expense amounts are VAT-inclusive unless noted otherwise. */
export function expenseVatParts(row: Expense, vatRate = 0.05): { exclusive: number; vat: number; inclusive: number } {
  const inclusive = Number(row.amount || 0)
  if (inclusive <= 0) return { exclusive: 0, vat: 0, inclusive: 0 }
  const exclusive = Math.round((inclusive / (1 + vatRate)) * 100) / 100
  const vat = Math.round((inclusive - exclusive) * 100) / 100
  return { exclusive, vat, inclusive }
}

export function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null
  try {
    const d = parseISO(String(value).slice(0, 10))
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}
