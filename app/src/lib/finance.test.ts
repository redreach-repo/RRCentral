import { describe, expect, it } from 'vitest'
import {
  countsTowardIncome,
  effectiveInvoicePaymentStatus,
  expenseVatParts,
  incomeVatParts,
  isOpenInvoice,
  isRecognizedIncome,
  monthKey,
  quarterMonths,
  sumExpenses,
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
})
