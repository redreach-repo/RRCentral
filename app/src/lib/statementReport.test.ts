import { describe, expect, it } from 'vitest'
import { buildStatement, quarterRange, signedAmount, statementCsv, statementPdf } from './statementReport'
import type { Expense, IncomeEntry } from './types'

const income = (p: Partial<IncomeEntry>): IncomeEntry =>
  ({
    id: 'i1',
    client_source: 'Maxtherm',
    category: 'RR Threads',
    reference_number: 'RR-01-26003',
    date: '2026-09-18',
    description: 'Uniforms',
    bill_amount: 5237.82,
    vat: 261.89,
    total_amount: 5499.71,
    status: 'Paid',
    payment_method: '',
    payment_status: 'Paid',
    ...p,
  }) as IncomeEntry

const expense = (p: Partial<Expense>): Expense =>
  ({
    id: 'e1',
    date: '2026-08-04',
    vendor: 'Cursor',
    category: 'Office',
    amount: 78.09,
    amount_ex_vat: 78.01,
    vat_amount: 0.08,
    payment_method: '',
    references_text: '',
    notes: '',
    created_at: '',
    ...p,
  }) as Expense

describe('statementReport', () => {
  it('gives quarter date ranges', () => {
    expect(quarterRange(2026, 3)).toEqual({ from: '2026-07-01', to: '2026-09-30' })
    expect(quarterRange(2024, 1)).toEqual({ from: '2024-01-01', to: '2024-03-31' })
  })

  it('merges income and expenses in date order with totals and VAT', () => {
    const st = buildStatement(
      [income({}), income({ id: 'i2', date: '2026-10-02' })],
      [expense({}), expense({ id: 'e2', date: '2026-06-30' }), expense({ id: 'e3', date: '2026-09-18', vendor: 'Zoom', amount: 54.14, amount_ex_vat: 54.06 })],
      '2026-07-01',
      '2026-09-30',
    )
    expect(st.rows.map((r) => `${r.date} ${r.kind}`)).toEqual([
      '2026-08-04 expense',
      '2026-09-18 income',
      '2026-09-18 expense',
    ])
    expect(st.totals).toMatchObject({
      income: 5499.71,
      expenses: 132.23,
      net: 5367.48,
      outputVat: 261.89,
      inputVat: 0.16,
      netVat: 261.73,
      incomeCount: 1,
      expenseCount: 2,
    })
  })

  it('shows each payment on the day it was received, splitting the invoice VAT', () => {
    const st = buildStatement(
      [income({ date: '2026-08-20' })],
      [],
      '2026-07-01',
      '2026-09-30',
      0.05,
      [
        { id: 'p2', invoice_ref: 'RR-01-26003', amount: 2629.4, created_at: '2026-09-30T08:00:00+00:00' },
        { id: 'p1', invoice_ref: 'RR-01-26003', amount: 2870.31, created_at: '2026-09-18T08:00:00+00:00' },
        { id: 'px', invoice_ref: 'RR-99', amount: 10, created_at: '2026-09-01T08:00:00+00:00' },
      ],
    )
    expect(st.rows.map((r) => [r.date, r.inclusive, r.vat, r.exclusive])).toEqual([
      ['2026-09-18', 2870.31, 136.68, 2733.63],
      ['2026-09-30', 2629.4, 125.21, 2504.19],
    ])
    expect(st.rows[0].description).toBe('Invoice RR-01-26003 · Uniforms · payment 1 of 2')
    expect(st.rows[1].description).toBe('Invoice RR-01-26003 · Uniforms · payment 2 of 2')
    expect(st.totals).toMatchObject({ income: 5499.71, outputVat: 261.89, incomeCount: 2 })
  })

  it('only counts payments that fall inside the period', () => {
    const st = buildStatement([income({})], [], '2026-10-01', '2026-12-31', 0.05, [
      { id: 'p1', invoice_ref: 'RR-01-26003', amount: 2870.31, created_at: '2026-09-18T08:00:00+00:00' },
      { id: 'p2', invoice_ref: 'RR-01-26003', amount: 2629.4, created_at: '2026-10-02T08:00:00+00:00' },
    ])
    expect(st.rows.map((r) => [r.date, r.vat])).toEqual([['2026-10-02', 125.21]])
  })

  it('signs income + and expenses -', () => {
    expect(signedAmount(1050, 'income')).toBe('+AED 1,050.00')
    expect(signedAmount(78.09, 'expense')).toBe('-AED 78.09')
    expect(signedAmount(-20, 'net')).toBe('-AED 20.00')
  })

  it('exports CSV with expenses as negative numbers', () => {
    const st = buildStatement([income({})], [expense({})], '2026-07-01', '2026-09-30')
    const csv = statementCsv(st, 'RED REACH')
    expect(csv).toContain('2026-08-04,Expense (-),Cursor,,,Office,-78.01,-0.08,-78.09')
    expect(csv).toContain('2026-09-18,Income (+),Maxtherm,Invoice RR-01-26003 · Uniforms,RR-01-26003,RR Threads,5237.82,261.89,5499.71')
    expect(csv).toContain('Net,,,,,,,261.81,5421.62')
  })

  it('builds a PDF, paginating long statements', () => {
    const many = Array.from({ length: 80 }, (_, i) => expense({ id: `e${i}`, date: '2026-08-05' }))
    const pdf = statementPdf(buildStatement([income({})], many, '2026-07-01', '2026-09-30'))
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
  })
})
