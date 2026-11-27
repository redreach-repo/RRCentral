import { describe, expect, it } from 'vitest'
import {
  ADVANCE_CATEGORY,
  advanceCostRows,
  advanceOpenBalance,
  advanceStatus,
  advancesByPo,
  billsForAdvance,
  maxApplicable,
  parseAdvanceForm,
  poRevenueExVat,
  poSupplierCost,
  withAdvanceCosts,
  type AdvanceForm,
  type SupplierAdvance,
  type SupplierAdvanceApplication,
} from './supplierAdvances'
import { sumExpenses } from './finance'
import type { Expense } from './types'

function adv(p: Partial<SupplierAdvance> & { id: string }): SupplierAdvance {
  return {
    vendor_id: null,
    vendor_name: 'Steel Supplier FZE',
    client_po_id: 'po1',
    quotation_id: 'q1',
    quote_reference: 'RR-01-26200',
    paid_on: '2026-11-22',
    amount: 20000,
    currency: 'AED',
    payment_method: 'Bank transfer',
    reference: 'TT-1',
    notes: '',
    created_by: 'a@b',
    created_at: '2026-11-22T10:00:00Z',
    ...p,
  }
}

function bill(p: Partial<Expense> & { id: string }): Expense {
  return {
    date: '2026-11-25',
    vendor: 'Steel Supplier FZE',
    category: 'Materials',
    amount: 21000,
    payment_method: '',
    references_text: '',
    notes: '',
    status: 'Recorded',
    quote_ref: 'RR-01-26200',
    created_at: '2026-11-25T10:00:00Z',
    ...p,
  }
}

const app = (id: string, advance_id: string, expense_id: string, amount: number): SupplierAdvanceApplication => ({
  id,
  advance_id,
  expense_id,
  amount,
  applied_on: '2026-11-25',
})

describe('advance balance and status', () => {
  it('is open until applied, part applied, then applied', () => {
    const a = adv({ id: 'a1' })
    expect(advanceStatus(a, [])).toBe('open')
    expect(advanceOpenBalance(a, [])).toBe(20000)
    const apps = [app('x1', 'a1', 'e1', 18000)]
    expect(advanceStatus(a, apps)).toBe('part')
    expect(advanceOpenBalance(a, apps)).toBe(2000)
    apps.push(app('x2', 'a1', 'e2', 2000))
    expect(advanceStatus(a, apps)).toBe('applied')
    expect(advanceOpenBalance(a, apps)).toBe(0)
  })

  it('caps what can be applied by the advance and by the bill', () => {
    const a = adv({ id: 'a1', amount: 20000 })
    const b = bill({ id: 'e1', amount: 21000 })
    expect(maxApplicable(a, b, [])).toBe(20000)
    const other = [app('x1', 'a9', 'e1', 19000)]
    expect(maxApplicable(a, b, other)).toBe(2000)
  })
})

describe('bills an advance can go against', () => {
  it('same vendor, not canceled, something left, the quote bills first', () => {
    const a = adv({ id: 'a1', vendor_name: ' steel supplier fze ' })
    const list = billsForAdvance(
      a,
      [
        bill({ id: 'e-other-quote', quote_ref: 'RR-01-99999', date: '2026-11-30' }),
        bill({ id: 'e-mine', date: '2026-11-01' }),
        bill({ id: 'e-canceled', status: 'Canceled' }),
        bill({ id: 'e-other-vendor', vendor: 'Someone Else' }),
        bill({ id: 'e-full', amount: 100 }),
        { ...bill({ id: 'e-deleted' }), deleted_at: '2026-11-26' },
      ],
      [app('x1', 'a2', 'e-full', 100)],
    )
    expect(list.map((b) => b.id)).toEqual(['e-mine', 'e-other-quote'])
    expect(list[0].left).toBe(21000)
  })
})

describe('money-out totals', () => {
  it('counts only the open part of an advance, once', () => {
    const a1 = adv({ id: 'a1', amount: 20000 })
    const a2 = adv({ id: 'a2', amount: 4000, paid_on: '2026-10-05', notes: 'deposit' })
    const bills = [bill({ id: 'e1', amount: 18000 })]
    const apps = [app('x1', 'a1', 'e1', 18000)]
    const rows = advanceCostRows([a1, a2], apps)
    expect(rows.map((r) => [r.date, r.amount, r.vat_amount, r.category])).toEqual([
      ['2026-11-22', 2000, 0, ADVANCE_CATEGORY],
      ['2026-10-05', 4000, 0, ADVANCE_CATEGORY],
    ])
    // Total money out = bill 18,000 + open 2,000 + open 4,000; the applied 18,000 is not counted twice.
    expect(sumExpenses(withAdvanceCosts(bills, [a1, a2], apps))).toBe(24000)
  })

  it('a fully applied advance adds nothing', () => {
    const a1 = adv({ id: 'a1', amount: 500 })
    expect(advanceCostRows([a1], [app('x', 'a1', 'e', 500)])).toEqual([])
    const bills = [bill({ id: 'e' })]
    expect(withAdvanceCosts(bills, [], [])).toBe(bills)
  })
})

describe('client PO margin', () => {
  const po = { id: 'po1', amount: 52500, vat_amount: 2500, quote_reference: 'RR-01-26200' }

  it('PO revenue is before VAT', () => {
    expect(poRevenueExVat(po)).toBe(50000)
    expect(poRevenueExVat({ amount: 52500, subtotal: 50000 })).toBe(50000)
    expect(poRevenueExVat({ amount: 1000 })).toBe(1000)
  })

  it('advance before the bill: the advance is the cost', () => {
    const c = poSupplierCost(po, [adv({ id: 'a1' })], [], [])
    expect(c).toEqual({ advancesPaid: 20000, advancesOpen: 20000, bills: 0, supplierCost: 20000, revenue: 50000, margin: 30000 })
  })

  it('after the bill arrives and the advance is applied: the bill is the cost, not both', () => {
    const bills = [bill({ id: 'e1', amount: 22050, amount_ex_vat: 21000, vat_amount: 1050 })]
    const c = poSupplierCost(po, [adv({ id: 'a1' })], [app('x1', 'a1', 'e1', 20000)], bills)
    expect(c.advancesOpen).toBe(0)
    expect(c.bills).toBe(21000)
    expect(c.supplierCost).toBe(21000)
    expect(c.margin).toBe(29000)
  })

  it('a bill applied from this PO counts even without the quote number; canceled bills and other POs do not', () => {
    const bills = [
      bill({ id: 'e1', amount: 5000, quote_ref: '' }),
      bill({ id: 'e2', amount: 999, status: 'Canceled' }),
      bill({ id: 'e3', amount: 777, quote_ref: 'RR-01-00001' }),
    ]
    const advances = [adv({ id: 'a1', amount: 5000 }), adv({ id: 'a2', client_po_id: 'po2', amount: 300 })]
    const c = poSupplierCost(po, advances, [app('x1', 'a1', 'e1', 5000)], bills)
    expect(c.bills).toBe(5000)
    expect(c.advancesPaid).toBe(5000)
    expect(c.supplierCost).toBe(5000)
  })

  it('totals per PO for the list', () => {
    const m = advancesByPo(
      [adv({ id: 'a1', amount: 100 }), adv({ id: 'a2', amount: 50 }), adv({ id: 'a3', client_po_id: 'po2', amount: 10 })],
      [app('x', 'a1', 'e', 100)],
    )
    expect(m.get('po1')).toEqual({ paid: 150, open: 50 })
    expect(m.get('po2')).toEqual({ paid: 10, open: 10 })
  })
})

describe('advance form', () => {
  const base: AdvanceForm = {
    vendor_id: '',
    vendor_name: 'Steel Supplier FZE',
    client_po_id: 'po1',
    quotation_id: '',
    paid_on: '2026-11-22',
    amount: '20,000',
    payment_method: 'Bank transfer',
    reference: ' TT-1 ',
    notes: '',
  }

  it('saves with the quote taken from the PO', () => {
    const r = parseAdvanceForm(base, { poHasQuote: true })
    expect('row' in r && r.row).toMatchObject({ amount: 20000, quotation_id: null, vendor_id: null, reference: 'TT-1' })
  })

  it('needs vendor, PO, quote, a positive amount and a date', () => {
    expect(parseAdvanceForm({ ...base, vendor_name: ' ' }, { poHasQuote: true })).toEqual({ error: 'Pick or type the vendor.' })
    expect(parseAdvanceForm({ ...base, client_po_id: '' }, { poHasQuote: true })).toEqual({
      error: 'Pick the client PO this advance is for.',
    })
    expect(parseAdvanceForm(base, { poHasQuote: false })).toEqual({ error: 'Pick the quotation this advance is for.' })
    expect(parseAdvanceForm({ ...base, amount: '0' }, { poHasQuote: true })).toEqual({
      error: 'Enter the amount paid (more than zero).',
    })
    expect(parseAdvanceForm({ ...base, paid_on: '' }, { poHasQuote: true })).toEqual({ error: 'Enter the date paid.' })
  })

  it('cannot go below what is already applied', () => {
    const r = parseAdvanceForm({ ...base, amount: '100' }, { poHasQuote: true, applied: 500 })
    expect('error' in r && r.error).toContain('already applied')
  })
})
