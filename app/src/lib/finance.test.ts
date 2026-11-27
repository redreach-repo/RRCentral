import { describe, expect, it } from 'vitest'
import {
  countsTowardIncome,
  effectiveInvoicePaymentStatus,
  expenseChargesVat,
  expenseVatParts,
  incomeVatParts,
  isOpenInvoice,
  isRecognizedIncome,
  monthKey,
  quarterMonths,
  sumExpenses,
  sumIncomeReceivedInMonth,
} from './finance'
import type { Expense, IncomeEntry, Invoice } from './types'

describe('finance', () => {
  it('recognizes paid income and rejects lost quotes', () => {
    expect(
      isRecognizedIncome({
        status: 'Awarded',
        payment_status: 'Paid',
        total_amount: 100,
      } as IncomeEntry),
    ).toBe(true)
    expect(
      isRecognizedIncome({
        status: 'Not awarded',
        payment_status: 'Paid',
        total_amount: 100,
      } as IncomeEntry),
    ).toBe(false)
    expect(
      isRecognizedIncome({
        status: 'Cancelled',
        payment_status: 'Paid',
        total_amount: 100,
      } as IncomeEntry),
    ).toBe(false)
  })

  it('detects open invoices', () => {
    expect(isOpenInvoice({ status: 'Sent', payment_status: 'Pending' } as Invoice)).toBe(true)
    expect(isOpenInvoice({ status: 'Cancelled', payment_status: 'Pending' } as Invoice)).toBe(false)
    expect(isOpenInvoice({ status: 'Draft', payment_status: 'Pending' } as Invoice)).toBe(false)
  })

  it('clears payment on cancelled invoices', () => {
    expect(
      effectiveInvoicePaymentStatus({ status: 'Cancelled', payment_status: 'Paid' } as Invoice),
    ).toBe('Pending')
    expect(
      effectiveInvoicePaymentStatus({ status: 'Awarded', payment_status: 'Paid' } as Invoice),
    ).toBe('Paid')
  })

  it('excludes cancelled and deleted invoice income from dashboard totals', () => {
    const row = {
      reference_number: 'RR-01-26001',
      status: 'Paid',
      payment_status: 'Paid',
      total_amount: 2845.5,
    } as IncomeEntry
    expect(
      countsTowardIncome(row, [
        { reference_number: 'RR-01-26001', status: 'Cancelled', payment_status: 'Paid' },
      ]),
    ).toBe(false)
    expect(countsTowardIncome(row, [], ['RR-01-26001'])).toBe(false)
    expect(
      countsTowardIncome(
        { ...row, reference_number: '26107' } as IncomeEntry,
        [{ reference_number: '26107', status: 'Awarded', payment_status: 'Paid' }],
      ),
    ).toBe(true)
  })

  it('monthKey and quarterMonths', () => {
    expect(monthKey('2026-07-15')).toBe('2026-07')
    expect(quarterMonths(2026, 3)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('sums expenses and splits VAT', () => {
    expect(sumExpenses([{ amount: 10 }, { amount: 5.5 }] as Expense[])).toBe(15.5)
    const inc = incomeVatParts(
      { total_amount: 105, bill_amount: 100, vat: 5 } as IncomeEntry,
      0.05,
    )
    expect(inc.exclusive).toBe(100)
    expect(inc.vat).toBe(5)
    const exp = expenseVatParts({ amount: 105 } as Expense, 0.05)
    expect(exp.inclusive).toBe(105)
    expect(Math.round(exp.exclusive * 100) / 100).toBe(100)
  })

  it('prefers explicit supplier-invoice VAT fields on expenses', () => {
    const exp = expenseVatParts(
      { amount: 2520, amount_ex_vat: 2400, vat_amount: 120 } as Expense,
      0.05,
    )
    expect(exp.exclusive).toBe(2400)
    expect(exp.vat).toBe(120)
    expect(exp.inclusive).toBe(2520)
  })

  it('keeps explicit zero VAT for non-VAT vendors (does not re-split at rate)', () => {
    const exp = expenseVatParts(
      { amount: 1000, amount_ex_vat: 1000, vat_amount: 0 } as Expense,
      0.05,
    )
    expect(exp.exclusive).toBe(1000)
    expect(exp.vat).toBe(0)
    expect(exp.inclusive).toBe(1000)
    expect(expenseChargesVat({ vat_amount: 0 })).toBe(false)
    expect(expenseChargesVat({ vat_amount: 50 })).toBe(true)
    expect(expenseChargesVat({ vat_amount: null })).toBe(true)
  })
})

describe('sumIncomeReceivedInMonth', () => {
  const nov = new Date(2026, 10, 1)
  const oct = new Date(2026, 9, 1)
  const row = (ref: string, date: string, total: number, pay = 'Paid'): IncomeEntry =>
    ({ reference_number: ref, date, total_amount: total, status: pay, payment_status: pay }) as IncomeEntry
  const inv = (ref: string, pay = 'Paid') =>
    ({ reference_number: ref, status: 'Finalized', payment_status: pay }) as Invoice

  it('counts an October invoice paid in November in November', () => {
    const rows = [row('RR-1', '2026-10-05', 1000)]
    const pays = [{ invoice_ref: 'RR-1', amount: 1000, created_at: '2026-11-27T10:00:00+00:00' }]
    expect(sumIncomeReceivedInMonth(rows, [inv('RR-1')], pays, nov)).toBe(1000)
    expect(sumIncomeReceivedInMonth(rows, [inv('RR-1')], pays, oct)).toBe(0)
  })

  it('splits partial payments across the months they came in', () => {
    const rows = [row('RR-2', '2026-10-05', 1000, 'Partial')]
    const pays = [
      { invoice_ref: 'RR-2', amount: 400, created_at: '2026-10-20T12:00:00+04:00' },
      { invoice_ref: 'RR-2', amount: 300, created_at: '2026-11-02T12:00:00+04:00' },
    ]
    const invs = [inv('RR-2', 'Partial')]
    expect(sumIncomeReceivedInMonth(rows, invs, pays, oct)).toBe(400)
    expect(sumIncomeReceivedInMonth(rows, invs, pays, nov)).toBe(300)
  })

  it('falls back to the income date when no payment was logged', () => {
    const rows = [row('', '2026-11-03', 250), row('RR-3', '2026-11-10', 500)]
    expect(sumIncomeReceivedInMonth(rows, [inv('RR-3')], [], nov)).toBe(750)
  })

  it('ignores unpaid and cancelled invoices even with payments', () => {
    const rows = [row('RR-4', '2026-11-01', 900, 'Paid')]
    const pays = [{ invoice_ref: 'RR-4', amount: 900, created_at: '2026-11-05T12:00:00+04:00' }]
    expect(
      sumIncomeReceivedInMonth(rows, [{ reference_number: 'RR-4', status: 'Cancelled', payment_status: 'Paid' } as Invoice], pays, nov),
    ).toBe(0)
    expect(sumIncomeReceivedInMonth(rows, [inv('RR-4', 'Pending')], pays, nov)).toBe(0)
  })
})
