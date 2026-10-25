import { describe, expect, it } from 'vitest'
import type { Expense, IncomeEntry, Invoice } from './types'
import {
  averageSalesCycle,
  canSeeProfit,
  cashForecast,
  crmSource,
  divisionLabel,
  NOT_RECORDED,
  quarterNetVat,
  revenueByDivision,
  revenueByLeadSource,
  sourceLabel,
  vatDueDate,
  winRateByPipeline,
  winRateBySource,
} from './salesReports'

function income(p: Partial<IncomeEntry>): IncomeEntry {
  return {
    id: 'i',
    client_source: '',
    category: '',
    reference_number: '',
    date: '2026-08-10',
    description: '',
    bill_amount: 0,
    vat: 0,
    total_amount: 0,
    status: 'Awarded',
    payment_method: '',
    payment_status: 'Paid',
    ...p,
  }
}

function invoice(p: Partial<Invoice>): Invoice {
  return {
    id: 'v',
    client: 'Acme',
    vertical: '',
    reference_number: 'RR-01-26001',
    date: '2026-10-01',
    description: '',
    amount: 0,
    status: 'Sent',
    payment_status: 'Unpaid',
    payment_terms: 'Net 30',
    moq: '',
    notes: '',
    delivery_terms: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

function expense(p: Partial<Expense>): Expense {
  return { id: 'e', date: '2026-08-10', vendor: 'X', category: '', amount: 0, ...p } as Expense
}

describe('canSeeProfit', () => {
  it.each([
    ['admin', true],
    ['manager', true],
    ['sales', false],
    ['staff', false],
    ['viewer', false],
  ] as const)('%s → %s', (role, ok) => {
    expect(canSeeProfit(role)).toBe(ok)
  })
  it('is off for no role', () => {
    expect(canSeeProfit(null)).toBe(false)
  })
})

describe('winRateByPipeline', () => {
  it('counts won, lost and open in each pipeline', () => {
    const rows = winRateByPipeline({
      quotes: [{ status: 'Awarded' }, { status: 'Not awarded' }, { status: 'Expired' }, { status: 'Sent' }, { status: 'Cancelled' }],
      crm: [{ pipeline_stage: 'Won' }, { pipeline_stage: 'Lead' }],
      sales: [{ stage: 'signed' }, { stage: 'signed' }, { stage: 'lost' }, { stage: 'lead' }],
      ctrm: [],
    })
    expect(rows.find((r) => r.key === 'quotes')).toMatchObject({ open: 1, won: 1, lost: 2, winPct: 33.3 })
    expect(rows.find((r) => r.key === 'crm')).toMatchObject({ open: 1, won: 1, lost: 0, winPct: 100 })
    expect(rows.find((r) => r.key === 'sales')).toMatchObject({ open: 1, won: 2, lost: 1, winPct: 66.7 })
    expect(rows.find((r) => r.key === 'ctrm')).toMatchObject({ open: 0, won: 0, lost: 0, winPct: null })
  })
})

describe('sources', () => {
  it('tidies free text', () => {
    expect(sourceLabel('  REFERRAL ')).toBe('Referral')
    expect(sourceLabel('linked_in')).toBe('Linked in')
    expect(sourceLabel('')).toBe(NOT_RECORDED)
  })
  it('treats website-made CRM rows as Website', () => {
    expect(crmSource({ created_by: 'website' })).toBe('Website')
    expect(crmSource({ created_by: 'lead-intake' })).toBe('Website')
    expect(crmSource({ created_by: 'alfred@x.com' })).toBe(NOT_RECORDED)
  })
  it('groups win rate by source with not recorded last', () => {
    const rows = winRateBySource({
      crm: [{ pipeline_stage: 'Won', created_by: 'website' }, { pipeline_stage: 'Lost', created_by: 'someone' }],
      sales: [{ stage: 'signed', source: 'Referral' }, { stage: 'lost', source: 'referral' }, { stage: 'lead', source: 'website' }],
      ctrm: [{ stage: 'signed', source: '' }],
    })
    expect(rows.map((r) => r.label)).toEqual(['Referral', 'Website', NOT_RECORDED])
    expect(rows[0]).toMatchObject({ won: 1, lost: 1, winPct: 50 })
    expect(rows[1]).toMatchObject({ won: 1, open: 1, winPct: 100 })
    expect(rows[2]).toMatchObject({ won: 1, lost: 1 })
  })
})

describe('averageSalesCycle', () => {
  it('measures created to won for each pipeline', () => {
    const rows = averageSalesCycle({
      sales: [
        { stage: 'signed', created_at: '2026-09-01T10:00:00Z', signed_at: '2026-09-11T10:00:00Z' },
        { stage: 'signed', created_at: '2026-09-01', signed_at: '2026-09-21' },
        { stage: 'signed', created_at: '2026-09-01', signed_at: null },
        { stage: 'lost', created_at: '2026-09-01', signed_at: null },
      ],
      ctrm: [{ id: 'd1', stage: 'signed', created_at: '2026-08-01' }],
      ctrmChanges: [
        { deal_id: 'd1', to_stage: 'signed', changed_at: '2026-08-31T09:00:00Z' },
        { deal_id: 'd1', to_stage: 'signed', changed_at: '2026-09-15T09:00:00Z' },
      ],
      crm: [{ pipeline_stage: 'Won', created_at: '2026-01-01', updated_at: '2026-01-04' }],
    })
    expect(rows[0]).toMatchObject({ key: 'sales', count: 2, avgDays: 15, medianDays: 15 })
    expect(rows[1]).toMatchObject({ key: 'ctrm', count: 1, avgDays: 30 })
    expect(rows[2]).toMatchObject({ key: 'crm', count: 1, avgDays: 3 })
  })
  it('is empty when nothing is won', () => {
    const rows = averageSalesCycle({ sales: [], ctrm: [], ctrmChanges: [], crm: [] })
    expect(rows.every((r) => r.avgDays === null && r.count === 0)).toBe(true)
  })
})

describe('revenue', () => {
  it('labels divisions, including account verticals', () => {
    expect(divisionLabel('01')).toBe('01 RR Threads')
    expect(divisionLabel('07')).toBe('07 AI CRM clients')
    expect(divisionLabel(null)).toBe('Other')
  })
  it('sums revenue excluding VAT by division', () => {
    const rows = revenueByDivision([
      income({ reference_number: 'RR-01-26001', bill_amount: 1000, vat: 50, total_amount: 1050 }),
      income({ reference_number: 'RR-01-26002', bill_amount: 500, vat: 25, total_amount: 525 }),
      income({ reference_number: 'RR-07-26001', bill_amount: 2000, vat: 100, total_amount: 2100 }),
      income({ reference_number: 'misc', bill_amount: 10, vat: 0, total_amount: 10 }),
    ])
    expect(rows).toEqual([
      { key: '07', label: '07 AI CRM clients', count: 1, revenue: 2000 },
      { key: '01', label: '01 RR Threads', count: 2, revenue: 1500 },
      { key: 'other', label: 'Other', count: 1, revenue: 10 },
    ])
  })
  it('finds the lead source through the invoice account, the account name, then the CRM', () => {
    const rows = revenueByLeadSource(
      [
        income({ reference_number: 'RR-07-26001', client_source: 'Whatever', bill_amount: 100, vat: 5, total_amount: 105 }),
        income({ reference_number: 'RR-01-26009', client_source: 'Beta LLC', bill_amount: 200, vat: 10, total_amount: 210 }),
        income({ reference_number: 'RR-01-26010', client_source: 'Gamma', bill_amount: 300, vat: 15, total_amount: 315 }),
        income({ reference_number: 'RR-01-26011', client_source: 'Nobody', bill_amount: 50, vat: 0, total_amount: 50 }),
      ],
      {
        invoices: [{ reference_number: 'RR-07-26001', account_id: 'a1' }],
        accounts: [
          { id: 'a1', name: 'Acme', source: 'referral' },
          { id: 'a2', name: 'Beta LLC', source: 'Referral' },
        ],
        crm: [{ company_name: 'Gamma', created_by: 'website' }],
      },
    )
    expect(rows).toEqual([
      { key: 'referral', label: 'Referral', count: 2, revenue: 300 },
      { key: 'website', label: 'Website', count: 1, revenue: 300 },
      { key: 'not recorded', label: NOT_RECORDED, count: 1, revenue: 50 },
    ])
  })
})

describe('VAT dates', () => {
  it('is due on the 28th of the month after the quarter', () => {
    expect(vatDueDate(2026, 3)).toBe('2026-10-28')
    expect(vatDueDate(2026, 4)).toBe('2027-01-28')
  })
  it('nets output VAT against input VAT for the quarter', () => {
    const net = quarterNetVat(
      2026,
      3,
      [income({ date: '2026-08-01', bill_amount: 1000, vat: 50, total_amount: 1050 }), income({ date: '2026-10-01', vat: 99, bill_amount: 1, total_amount: 100 })],
      [expense({ date: '2026-09-01', amount: 105, vat_amount: 5 } as Partial<Expense>)],
    )
    expect(net).toBe(45)
  })
})

describe('cashForecast', () => {
  const today = new Date(2026, 9, 25) // 25 Oct 2026
  it('puts invoice balances on their due date, overdue ones today', () => {
    const f = cashForecast({
      today,
      invoices: [
        invoice({ reference_number: 'RR-01-1', date: '2026-10-20', amount: 1000 }), // due 19 Nov
        invoice({ reference_number: 'RR-01-2', date: '2026-08-01', amount: 500 }), // overdue
        invoice({ reference_number: 'RR-01-3', date: '2026-10-01', amount: 400, payment_status: 'Paid' }),
        invoice({ reference_number: 'RR-01-4', date: '2026-10-01', amount: 400, status: 'Draft' }),
        invoice({ reference_number: 'RR-01-5', date: '2027-03-01', amount: 999 }), // past window
      ],
      paymentLog: [{ invoice_ref: 'RR-01-1', amount: 250 }],
      income: [],
      expenses: [],
    })
    const ins = f.lines.filter((l) => l.kind === 'in')
    expect(ins).toEqual([
      expect.objectContaining({ date: '2026-10-25', amount: 500, overdue: true }),
      expect.objectContaining({ date: '2026-11-19', amount: 750, overdue: false }),
    ])
    expect(f.totals.cashIn).toBe(1250)
  })
  it('takes out recurring costs and the VAT return due in the window', () => {
    const f = cashForecast({
      today,
      invoices: [],
      paymentLog: [],
      income: [income({ date: '2026-08-15', bill_amount: 2000, vat: 100, total_amount: 2100 })],
      expenses: [],
      fixedMonthlyCostAed: 1000,
    })
    const vat = f.lines.filter((l) => l.kind === 'vat')
    expect(vat).toEqual([expect.objectContaining({ date: '2026-10-28', amount: 100, label: 'VAT return Q3 2026' })])
    // Nov, Dec and Jan each: 3 deductions plus the fixed cost (23 Jan is the window end, so only 1 and 4 and 6 Jan).
    const fixed = f.lines.filter((l) => l.label === 'Fixed monthly cost').map((l) => l.date)
    expect(fixed).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    const bank = f.lines.filter((l) => l.label === 'Bank Service Charge').map((l) => l.date)
    expect(bank).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    expect(f.totals.vat).toBe(100)
    expect(f.totals.net).toBeCloseTo(-f.totals.cashOut - 100, 2)
  })
  it('runs a weekly balance across the window', () => {
    const f = cashForecast({ today, invoices: [invoice({ date: '2026-10-25', payment_terms: '', amount: 300 })], paymentLog: [], income: [], expenses: [] })
    expect(f.weeks.length).toBe(13)
    expect(f.weeks[0]).toMatchObject({ start: '2026-10-25', cashIn: 300 })
    expect(f.weeks.at(-1)!.end).toBe('2027-01-23')
    expect(f.weeks.at(-1)!.running).toBe(f.totals.net)
  })
})
