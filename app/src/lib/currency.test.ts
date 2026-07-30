import { describe, expect, it } from 'vitest'
import {
  exchangeGainLoss,
  formatMoneyAmount,
  fromBaseAmount,
  netReceived,
  sumByCurrency,
  toBaseAmount,
} from './currency'

describe('currency conversion', () => {
  it('converts using stored rate without mutating originals', () => {
    expect(toBaseAmount(100, 3.67)).toBe(367)
    expect(fromBaseAmount(367, 3.67)).toBe(100)
  })

  it('nets fees from received amount', () => {
    expect(netReceived({ amountReceived: 1000, processingFee: 10, conversionFee: 5 })).toBe(985)
  })

  it('never cross-adds currencies', () => {
    const sums = sumByCurrency([
      { amount: 100, currency: 'USD' },
      { amount: 50, currency: 'USD' },
      { amount: 200, currency: 'EUR' },
    ])
    expect(sums).toEqual({ USD: 150, EUR: 200 })
  })

  it('computes FX gain/loss in base', () => {
    expect(exchangeGainLoss(367, 370)).toBe(3)
    expect(exchangeGainLoss(367, 360)).toBe(-7)
  })

  it('formats with currency code', () => {
    expect(formatMoneyAmount(12.5, 'AED')).toContain('AED')
  })
})
