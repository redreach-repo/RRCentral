import { describe, expect, it } from 'vitest'
import {
  allocateSupplierCostAcrossDeal,
  quoteRevenueExclusive,
  resolveDealRef,
} from './dealQuotes'

describe('dealQuotes', () => {
  it('resolves deal_ref with fallbacks', () => {
    expect(
      resolveDealRef({
        deal_ref: 'DEAL-1',
        base_reference: 'RR-01-26003',
        reference_number: 'RR-01-26003_revision 1',
        quote_id: 'Q-1',
        id: 'uuid',
      }),
    ).toBe('DEAL-1')
    expect(
      resolveDealRef({
        deal_ref: '',
        base_reference: '',
        reference_number: 'RR-01-26003',
        quote_id: 'Q-1',
        id: 'uuid',
      }),
    ).toBe('RR-01-26003')
  })

  it('splits Maxtherm-style supplier cost across partial-delivery branches by revenue', () => {
    // 75% / 25% revenue split; supplier charged 2400 ex-VAT for all four items
    const shares = allocateSupplierCostAcrossDeal(
      [
        {
          id: 'a',
          reference_number: 'RR-01-26003',
          quote_id: 'Q-a',
          amount: 3150, // ex-VAT 3000
          offset_vat: false,
          status: 'Awarded',
        },
        {
          id: 'b',
          reference_number: 'RR-01-26010',
          quote_id: 'Q-b',
          amount: 1050, // ex-VAT 1000
          offset_vat: false,
          status: 'Draft',
        },
      ],
      2400,
      0.05,
    )
    expect(quoteRevenueExclusive({ amount: 3150 }, 0.05)).toBe(3000)
    expect(quoteRevenueExclusive({ amount: 1050 }, 0.05)).toBe(1000)
    expect(shares[0].costExclusive).toBe(1800)
    expect(shares[1].costExclusive).toBe(600)
    expect(shares[0].profit).toBe(1200)
    expect(shares[1].profit).toBe(400)
    expect(shares[0].sharePct).toBe(75)
    expect(shares[1].sharePct).toBe(25)
  })

  it('puts full supplier cost on the first quote when branches have no revenue yet', () => {
    const shares = allocateSupplierCostAcrossDeal(
      [
        { id: 'a', reference_number: 'RR-01-26003', quote_id: 'Q-a', amount: 0, status: 'Awarded' },
        { id: 'b', reference_number: '', quote_id: 'Q-b', amount: 0, status: 'Draft' },
      ],
      2400,
      0.05,
    )
    expect(shares[0].costExclusive).toBe(2400)
    expect(shares[1].costExclusive).toBe(0)
  })
})
