import { describe, expect, it } from 'vitest'
import {
  buildWpsCsvDraft,
  dailyWageFromBasicMonthly,
  draftGratuityAccrualAed,
  payrollNetAed,
  yearsOfServiceFromStart,
} from './wpsGratuity'

describe('draftGratuityAccrualAed', () => {
  it('returns 0 for incomplete service', () => {
    expect(draftGratuityAccrualAed({ yearsOfService: 0, dailyWageAed: 100 })).toBe(0)
  })

  it('uses 21 days per year for the first five years', () => {
    expect(draftGratuityAccrualAed({ yearsOfService: 3, dailyWageAed: 100 })).toBe(6300)
  })

  it('adds 30 days per year after year five', () => {
    expect(draftGratuityAccrualAed({ yearsOfService: 6, dailyWageAed: 100 })).toBe(21 * 5 * 100 + 30 * 100)
  })
})

describe('buildWpsCsvDraft', () => {
  it('writes a header and one data row', () => {
    const csv = buildWpsCsvDraft(
      [{ employeeCode: 'E1', employeeName: 'Ada', iban: 'AE00', amountAed: 12.5 }],
      '2026-11-15',
    )
    expect(csv.split('\n')).toEqual([
      'EmployeeCode,EmployeeName,IBAN,AmountAED,ValueDate',
      'E1,Ada,AE00,12.50,2026-11-15',
    ])
  })
})

describe('yearsOfServiceFromStart', () => {
  it('floors full years', () => {
    expect(yearsOfServiceFromStart('2020-01-01', '2023-01-01')).toBe(3)
    expect(yearsOfServiceFromStart(null)).toBe(0)
  })
})

describe('dailyWageFromBasicMonthly', () => {
  it('divides by 30', () => {
    expect(dailyWageFromBasicMonthly(3000)).toBe(100)
  })
})

describe('payrollNetAed', () => {
  it('never goes negative', () => {
    expect(payrollNetAed(1000, 100, 50)).toBe(1050)
    expect(payrollNetAed(100, 0, 500)).toBe(0)
  })
})
