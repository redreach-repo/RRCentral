import { describe, expect, it } from 'vitest'
import {
  add, allocate, convert, currencyDecimals, divide, fromMinor, lineMoney, money, multiply, parseDecimal, roundAmount,
  roundToScale, sub, sum, sumAmounts, toDecimalString, toNumber, zero, type Money,
} from './index'
import { calcTotals, calcTotalsMoney } from '../lineItems'
import { dailyWageFromBasicMonthly, draftGratuityAccrualAed, payrollNetAed } from '../wpsGratuity'
import fixtures from './__fixtures__/redreach-regression.json'

/** Small seeded PRNG so property tests are repeatable without a new dependency. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const CURRENCIES = ['AED', 'JPY', 'KWD'] as const

function randomAmount(r: () => number, currency: string): string {
  const d = currencyDecimals(currency)
  const minor = BigInt(Math.floor(r() * 10_000_000)) - 2_000_000n
  return toDecimalString(fromMinor(minor, currency)) + (d > 0 ? String(Math.floor(r() * 10)) : '')
}

describe('currency rules', () => {
  it('knows zero, two and three decimal currencies', () => {
    expect(currencyDecimals('JPY')).toBe(0)
    expect(currencyDecimals('AED')).toBe(2)
    expect(currencyDecimals('KWD')).toBe(3)
    expect(currencyDecimals('bhd')).toBe(3)
  })
  it('rounds half away from zero like Postgres round()', () => {
    expect(toDecimalString(money('1.005', 'AED'))).toBe('1.01')
    expect(toDecimalString(money(1.005, 'AED'))).toBe('1.01') // Math.round(1.005*100)/100 gives 1.00
    expect(toDecimalString(money('-2.345', 'AED'))).toBe('-2.35')
    expect(toDecimalString(money('1234.5', 'JPY'))).toBe('1235')
    expect(toDecimalString(money('0.0005', 'KWD'))).toBe('0.001')
    expect(toDecimalString(money('12.3454', 'KWD'))).toBe('12.345')
    expect(roundToScale('2.5', 0, 'half-even')).toBe(2n)
    expect(roundToScale('1e-7', 2)).toBe(0n)
    expect(roundToScale(1.5e21, 0)).toBe(1500000000000000000000n)
  })
  it('refuses junk and mixed currencies', () => {
    expect(() => parseDecimal('12abc')).toThrow()
    expect(() => money(Number.NaN, 'AED')).toThrow()
    expect(() => add(money(1, 'AED'), money(1, 'USD'))).toThrow()
    expect(roundAmount('x')).toBe(0)
  })
})

describe('exact totals per currency (accept: AED, JPY, KWD)', () => {
  it('invoice totals are exact', () => {
    const aed = lineMoney('3', '33.335', '0.05', 'AED') // 100.005 → 100.01; VAT 5.0005 → 5.00
    expect([toDecimalString(aed.amount), toDecimalString(aed.vat), toDecimalString(aed.total)]).toEqual(['100.01', '5.00', '105.01'])
    const jpy = lineMoney('3', '333.5', '0.1', 'JPY')
    expect([toDecimalString(jpy.amount), toDecimalString(jpy.vat), toDecimalString(jpy.total)]).toEqual(['1001', '100', '1101'])
    const kwd = lineMoney('7', '1.2345', '0.05', 'KWD') // 8.6415 → 8.642; VAT 0.4321 → 0.432
    expect([toDecimalString(kwd.amount), toDecimalString(kwd.vat), toDecimalString(kwd.total)]).toEqual(['8.642', '0.432', '9.074'])
    const items = [{ qty: 7, unit_price: 1.2345, unit_cost: 0 }, { qty: 1, unit_price: 0.0005, unit_cost: 0 }].map((x, i) => ({
      key: String(i), description: '', remarks: '', sku: '', sizes: null, image_data: '', ...x,
    }))
    const t = calcTotalsMoney(items, 0.05, undefined, 'KWD')
    expect(toDecimalString(t.total)).toBe('9.075') // 8.643 + 0.432
  })
  it('payroll totals are exact', () => {
    for (const c of CURRENCIES) {
      const lines = Array.from({ length: 1000 }, () => money(c === 'JPY' ? '333' : c === 'KWD' ? '0.111' : '0.11', c))
      const expected = { AED: '110.00', JPY: '333000', KWD: '111.000' }[c]
      expect(toDecimalString(sum(lines, c))).toBe(expected)
    }
    // 0.1 + 0.2 in floats is 0.30000000000000004
    expect(sumAmounts([0.1, 0.2])).toBe(0.3)
  })
})

describe('property tests', () => {
  it('sum of parts equals the total (allocate)', () => {
    const r = rng(42)
    for (let i = 0; i < 2000; i++) {
      const c = CURRENCIES[i % 3]
      const total = money(randomAmount(r, c), c)
      const weights = Array.from({ length: 1 + Math.floor(r() * 7) }, () => String(Math.floor(r() * 1000) + 1))
      const parts = allocate(total, weights)
      expect(sum(parts, c).minor).toBe(total.minor)
      const unit = total.minor < 0n ? -1n : 1n
      const share = (w: string) => (total.minor * BigInt(w)) / weights.reduce((a, b) => a + BigInt(b), 0n)
      parts.forEach((p, k) => expect(((p.minor - share(weights[k])) * unit) >= 0n && ((p.minor - share(weights[k])) * unit) <= 1n).toBe(true))
    }
  })
  it('no drift after many operations', () => {
    const r = rng(7)
    for (const c of CURRENCIES) {
      let acc: Money = zero(c)
      const added: Money[] = []
      for (let i = 0; i < 5000; i++) {
        const m = money(randomAmount(r, c), c)
        added.push(m)
        acc = add(acc, m)
      }
      for (const m of added) acc = sub(acc, m)
      expect(acc.minor).toBe(0n)
    }
  })
  it('rounding never moves a value by more than half a minor unit', () => {
    const r = rng(99)
    for (let i = 0; i < 3000; i++) {
      const c = CURRENCIES[i % 3]
      const raw = randomAmount(r, c) + String(Math.floor(r() * 1000))
      const d = parseDecimal(raw)
      const m = money(raw, c)
      const scale = Math.max(d.scale, currencyDecimals(c))
      const diff = m.minor * 10n ** BigInt(scale - currencyDecimals(c)) - d.coef * 10n ** BigInt(scale - d.scale)
      const half = 5n * 10n ** BigInt(scale - currencyDecimals(c) - 1 < 0 ? 0 : scale - currencyDecimals(c) - 1)
      expect(diff <= half && diff >= -half).toBe(true)
    }
  })
  it('multiply, divide and convert round per currency', () => {
    expect(toDecimalString(multiply(money('10.00', 'AED'), '0.333'))).toBe('3.33')
    expect(toDecimalString(divide(money('100', 'AED'), 3))).toBe('33.33')
    expect(toDecimalString(divide(money('100', 'KWD'), 3))).toBe('33.333')
    expect(toDecimalString(convert(money('100', 'USD'), '3.6725', 'AED'))).toBe('367.25')
    expect(toDecimalString(convert(money('1000', 'JPY'), '0.0245', 'AED'))).toBe('24.50')
    expect(toDecimalString(convert(money('1', 'KWD'), '11.9654', 'AED'))).toBe('11.97')
    expect(toNumber(money('12.5', 'JPY'))).toBe(13)
  })
})

describe('regression: Red Reach invoices and payroll still total the same', () => {
  it.each(fixtures.invoices.map((f) => [f.ref, f] as const))('invoice %s', (_ref, f) => {
    const items = f.items.map((x, i) => ({ key: String(i), description: '', remarks: '', sku: '', sizes: null, image_data: '', ...x }))
    const discount = (f as { discount?: { discountPercent?: number; discountAmount?: number } }).discount
    expect(calcTotals(items, f.vatRate, discount)).toEqual(f.expected)
  })
  it.each(fixtures.payroll.map((f) => [f.ref, f] as const))('payroll %s', (_ref, f) => {
    const nets = f.lines.map((l) => payrollNetAed(l.basic, l.allowances, l.deductions))
    const grats = f.lines.map((l) => draftGratuityAccrualAed({ yearsOfService: l.years, dailyWageAed: dailyWageFromBasicMonthly(l.basic) }))
    expect(nets).toEqual(f.lines.map((l) => l.net))
    expect(grats).toEqual(f.lines.map((l) => l.gratuity))
    expect(sumAmounts(nets)).toBe(f.totalNet)
    expect(sumAmounts(grats)).toBe(f.totalGratuity)
  })
})
