import { format, parseISO, startOfMonth } from 'date-fns'
import { db } from './db'
import { errorMessage, isUndefinedColumnError } from './errors'
import type { Expense } from './types'

/** Monthly deductions that must exist from Aug 2026 onward (append-only). */
export const RECURRING_DEDUCTIONS = [
  { day: 1, vendor: 'Bank Service Charge', amount: 210, notes: 'Monthly bank deduction' },
  { day: 4, vendor: 'Cursor', amount: 78.09, notes: 'Monthly Cursor subscription' },
  { day: 8, vendor: 'Zoom Account', amount: 54.14, notes: 'Monthly Zoom subscription' },
] as const

const START = startOfMonth(parseISO('2026-08-01'))

export type RecurringDeductionInsert = {
  date: string
  vendor: string
  category: string
  amount: number
  amount_ex_vat: number
  vat_amount: number
  payment_method: string
  references_text: string
  notes: string
  quote_ref: string
  supplier_invoice_no: string
}

export type EnsureRecurringResult = {
  inserted: number
  error?: string
}

function monthKey(date: string | null | undefined): string {
  return (date || '').slice(0, 7)
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.02
}

function vendorMatches(existing: string, expected: string): boolean {
  return existing.trim().toLowerCase() === expected.trim().toLowerCase()
}

/** Months from Aug 2026 through the current calendar month (inclusive). */
export function recurringDeductionMonths(through: Date = new Date()): string[] {
  const end = startOfMonth(through)
  if (end < START) return []
  const keys: string[] = []
  const cursor = new Date(START)
  while (cursor <= end) {
    keys.push(format(cursor, 'yyyy-MM'))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return keys
}

export function buildMissingRecurringDeductions(
  existing: Pick<Expense, 'date' | 'vendor' | 'amount'>[],
  through: Date = new Date(),
): RecurringDeductionInsert[] {
  const months = recurringDeductionMonths(through)
  const missing: RecurringDeductionInsert[] = []

  for (const ym of months) {
    for (const rule of RECURRING_DEDUCTIONS) {
      const already = existing.some(
        (e) =>
          monthKey(e.date) === ym &&
          vendorMatches(e.vendor || '', rule.vendor) &&
          amountsMatch(Number(e.amount) || 0, rule.amount),
      )
      if (already) continue
      const day = String(rule.day).padStart(2, '0')
      missing.push({
        date: `${ym}-${day}`,
        vendor: rule.vendor,
        category: 'Other',
        amount: rule.amount,
        amount_ex_vat: rule.amount,
        vat_amount: 0,
        payment_method: 'Bank Transfer',
        references_text: 'Recurring monthly deduction',
        notes: rule.notes,
        quote_ref: '',
        supplier_invoice_no: '',
      })
    }
  }

  return missing
}

async function insertRecurringRows(rows: RecurringDeductionInsert[]): Promise<void> {
  if (!rows.length) return
  const { error } = await db.from('expenses').insert(rows)
  if (!error) return
  if (isUndefinedColumnError(error)) {
    const legacy = rows.map(
      ({ amount_ex_vat: _a, vat_amount: _v, quote_ref: _q, supplier_invoice_no: _s, ...rest }) => rest,
    )
    const retry = await db.from('expenses').insert(legacy)
    if (retry.error) throw retry.error
    return
  }
  throw error
}

/**
 * Insert any missing Bank / Cursor / Zoom monthly deductions from Aug 2026
 * through the current month. Never deletes or updates existing rows.
 */
export async function ensureRecurringDeductions(
  through: Date = new Date(),
): Promise<EnsureRecurringResult> {
  try {
    const { data, error } = await db.from('expenses').select('date,vendor,amount')
    if (error) throw error
    const existing = (data || []) as Pick<Expense, 'date' | 'vendor' | 'amount'>[]
    const missing = buildMissingRecurringDeductions(existing, through)
    if (!missing.length) return { inserted: 0 }
    await insertRecurringRows(missing)
    return { inserted: missing.length }
  } catch (e) {
    return { inserted: 0, error: errorMessage(e, 'Could not sync recurring deductions') }
  }
}
