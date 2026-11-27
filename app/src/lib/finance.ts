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

/** A payment's received day (local time), so a payment logged late on the 30th stays in its month. */
export function paymentDate(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null
  const s = String(createdAt)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = parseISO(s)
  if (Number.isNaN(d.getTime())) return monthKey(s) ? s.slice(0, 10) : null
  return format(d, 'yyyy-MM-dd')
}

/**
 * Income received in a month (cash basis), for the dashboard "This month" card.
 * An invoice's income counts in the month the money came in (its payment_log rows),
 * not the month the invoice is dated, so an October invoice paid in November shows
 * in November. Rows with no logged payments (old sheet income, or invoices marked
 * paid before payments were logged) fall back to the income row's own date.
 */
export function sumIncomeReceivedInMonth(
  rows: IncomeEntry[],
  invoices: Array<Pick<Invoice, 'reference_number' | 'status' | 'payment_status'>>,
  payments: Array<{ invoice_ref?: string | null; amount?: number | string | null; created_at?: string | null }>,
  month = startOfMonth(new Date()),
  deletedInvoiceRefs?: Set<string> | string[],
): number {
  const byRef = new Map<string, Array<{ amount: number; date: string | null }>>()
  for (const p of payments) {
    const ref = String(p.invoice_ref || '').trim()
    if (!ref) continue
    const list = byRef.get(ref) || []
    list.push({ amount: Number(p.amount) || 0, date: paymentDate(p.created_at) })
    byRef.set(ref, list)
  }

  let total = 0
  const seen = new Set<string>()
  for (const row of rows) {
    if (!countsTowardIncome(row, invoices, deletedInvoiceRefs)) continue
    const ref = String(row.reference_number || '').trim()
    const paid = ref ? byRef.get(ref) : undefined
    if (paid && paid.length) {
      if (seen.has(ref)) continue
      seen.add(ref)
      for (const p of paid) if (isInMonth(p.date, month)) total += p.amount
    } else if (isInMonth(row.date, month)) {
      total += Number(row.total_amount || 0)
    }
  }
  return Math.round(total * 100) / 100
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

/**
 * Whether an expense row charges input VAT.
 * Explicit `vat_amount: 0` means no VAT (common for non-VAT vendors).
 * Legacy rows without the column keep the default rate split.
 */
export function expenseChargesVat(row: Pick<Expense, 'vat_amount'>): boolean {
  if (row.vat_amount != null && Number.isFinite(Number(row.vat_amount))) {
    return Number(row.vat_amount) > 0
  }
  return true
}

/** Prefer explicit supplier-invoice VAT fields; else assume amount is VAT-inclusive. */
export function expenseVatParts(row: Expense, vatRate = 0.05): { exclusive: number; vat: number; inclusive: number } {
  const inclusive = Number(row.amount || 0)
  const explicitEx = Number(row.amount_ex_vat)
  const explicitVat = Number(row.vat_amount)
  const hasEx = Number.isFinite(explicitEx) && explicitEx > 0
  const hasVat = Number.isFinite(explicitVat) && explicitVat >= 0 && row.vat_amount != null
  if (hasEx || hasVat) {
    const exclusive = hasEx
      ? Math.round(explicitEx * 100) / 100
      : Math.round(Math.max(0, inclusive - explicitVat) * 100) / 100
    const vat = hasVat
      ? Math.round(explicitVat * 100) / 100
      : Math.round(Math.max(0, inclusive - exclusive) * 100) / 100
    const incl = inclusive > 0 ? inclusive : Math.round((exclusive + vat) * 100) / 100
    return { exclusive, vat, inclusive: incl }
  }
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
