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

export const RECURRING_REF = 'Recurring monthly deduction'

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
  removed: number
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

function isRecurringVendor(vendor: string): boolean {
  return RECURRING_DEDUCTIONS.some((r) => vendorMatches(vendor, r.vendor))
}

function matchesRecurringRule(
  row: Pick<Expense, 'date' | 'vendor' | 'amount'>,
  rule: (typeof RECURRING_DEDUCTIONS)[number],
  ym: string,
): boolean {
  return (
    monthKey(row.date) === ym &&
    vendorMatches(row.vendor || '', rule.vendor) &&
    amountsMatch(Number(row.amount) || 0, rule.amount)
  )
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
      const already = existing.some((e) => matchesRecurringRule(e, rule, ym))
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
        references_text: RECURRING_REF,
        notes: rule.notes,
        quote_ref: '',
        supplier_invoice_no: '',
      })
    }
  }

  return missing
}

/**
 * For each vendor+amount+month from Aug 2026, keep one row and drop the rest.
 * Prefer keeping the earliest created_at (or first id).
 */
export function findDuplicateRecurringExpenseIds(
  existing: Pick<Expense, 'id' | 'date' | 'vendor' | 'amount' | 'created_at' | 'references_text'>[],
  through: Date = new Date(),
): string[] {
  const months = recurringDeductionMonths(through)
  const toDelete: string[] = []

  for (const ym of months) {
    for (const rule of RECURRING_DEDUCTIONS) {
      const matches = existing
        .filter((e) => matchesRecurringRule(e, rule, ym))
        .sort((a, b) => {
          const ac = a.created_at || ''
          const bc = b.created_at || ''
          if (ac !== bc) return ac.localeCompare(bc)
          return String(a.id).localeCompare(String(b.id))
        })
      if (matches.length <= 1) continue
      for (const dup of matches.slice(1)) {
        if (dup.id) toDelete.push(String(dup.id))
      }
    }
  }

  return toDelete
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

async function deleteExpenseIds(ids: string[]): Promise<void> {
  for (const id of ids) {
    const { error } = await db.from('expenses').delete().eq('id', id)
    if (error) throw error
  }
}

let inFlight: Promise<EnsureRecurringResult> | null = null

/**
 * Dedupe then insert missing Bank / Cursor / Zoom monthly rows from Aug 2026.
 * Serialized so login sync + Expenses load cannot double-insert.
 */
export async function ensureRecurringDeductions(
  through: Date = new Date(),
): Promise<EnsureRecurringResult> {
  if (inFlight) return inFlight

  inFlight = (async (): Promise<EnsureRecurringResult> => {
    try {
      const { data, error } = await db
        .from('expenses')
        .select('id,date,vendor,amount,created_at,references_text')
      if (error) throw error
      const existing = (data || []) as Pick<
        Expense,
        'id' | 'date' | 'vendor' | 'amount' | 'created_at' | 'references_text'
      >[]

      const dupIds = findDuplicateRecurringExpenseIds(existing, through)
      if (dupIds.length) await deleteExpenseIds(dupIds)

      const afterDedupe = existing.filter((e) => !dupIds.includes(String(e.id)))
      const missing = buildMissingRecurringDeductions(afterDedupe, through)
      if (missing.length) {
        // Re-read once more right before insert to avoid races with another tab.
        const { data: fresh, error: freshErr } = await db
          .from('expenses')
          .select('date,vendor,amount')
        if (freshErr) throw freshErr
        const stillMissing = buildMissingRecurringDeductions(
          (fresh || []) as Pick<Expense, 'date' | 'vendor' | 'amount'>[],
          through,
        )
        if (stillMissing.length) await insertRecurringRows(stillMissing)
        return { inserted: stillMissing.length, removed: dupIds.length }
      }

      return { inserted: 0, removed: dupIds.length }
    } catch (e) {
      return {
        inserted: 0,
        removed: 0,
        error: errorMessage(e, 'Could not sync recurring deductions'),
      }
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export { isRecurringVendor }
