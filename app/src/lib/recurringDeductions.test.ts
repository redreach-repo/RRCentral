import { describe, expect, it } from 'vitest'
import {
  buildMissingRecurringDeductions,
  recurringDeductionMonths,
  RECURRING_DEDUCTIONS,
} from './recurringDeductions'

describe('recurringDeductions', () => {
  it('lists months from Aug 2026 through the given month', () => {
    expect(recurringDeductionMonths(new Date('2026-07-15'))).toEqual([])
    expect(recurringDeductionMonths(new Date('2026-08-15'))).toEqual(['2026-08'])
    expect(recurringDeductionMonths(new Date('2026-10-05'))).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ])
  })

  it('skips months that already have matching vendor+amount rows', () => {
    const existing = [
      { date: '2026-08-01', vendor: 'Bank Service Charge', amount: 210 },
      { date: '2026-08-04', vendor: 'Cursor', amount: 78.09 },
      { date: '2026-08-08', vendor: 'Zoom Account', amount: 54.14 },
    ]
    const missing = buildMissingRecurringDeductions(existing, new Date('2026-08-20'))
    expect(missing).toEqual([])
  })

  it('adds only missing deductions and keeps prior data untouched', () => {
    const existing = [
      { date: '2026-07-01', vendor: 'Bank Service Charge', amount: 210 },
      { date: '2026-08-01', vendor: 'Bank Service Charge', amount: 210 },
    ]
    const missing = buildMissingRecurringDeductions(existing, new Date('2026-08-20'))
    expect(missing).toHaveLength(2) // Cursor + Zoom for Aug only
    expect(missing.map((m) => m.vendor).sort()).toEqual(['Cursor', 'Zoom Account'])
    expect(missing.every((m) => m.date.startsWith('2026-08'))).toBe(true)
  })

  it('uses the configured day-of-month for each vendor', () => {
    const missing = buildMissingRecurringDeductions([], new Date('2026-08-01'))
    expect(missing).toHaveLength(RECURRING_DEDUCTIONS.length)
    expect(missing.find((m) => m.vendor === 'Bank Service Charge')?.date).toBe('2026-08-01')
    expect(missing.find((m) => m.vendor === 'Cursor')?.date).toBe('2026-08-04')
    expect(missing.find((m) => m.vendor === 'Zoom Account')?.date).toBe('2026-08-08')
  })
})
