import { describe, expect, it } from 'vitest'
import { buildWpsCsvDraft, draftGratuityAccrualAed } from './wpsGratuity'

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
