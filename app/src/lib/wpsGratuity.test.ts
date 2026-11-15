import { describe, expect, it } from 'vitest'
import {
  buildWpsCsvDraft,
  buildWpsSifDraft,
  dailyWageFromBasicMonthly,
  draftGratuityAccrualAed,
  daysInclusive,
  payrollNetAed,
  periodBoundsFromYyyyMm,
  validateAeIban,
  validateLabourCardNo,
  validateRoutingCode,
  wpsFileReadiness,
  yearsOfServiceFromStart,
} from './wpsGratuity'

/** Public-style AE IBAN that passes ISO 13616 mod-97 (test fixture only). */
const VALID_AE_IBAN = 'AE070331234567890123456'

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

  it('zeros resignation under one year', () => {
    expect(draftGratuityAccrualAed({ yearsOfService: 0, dailyWageAed: 100, reason: 'resignation' })).toBe(0)
  })

  it('applies draft resignation taper under five years', () => {
    // 3y × 21 days → 63, half → 32 days × 100 = 3200
    expect(draftGratuityAccrualAed({ yearsOfService: 3, dailyWageAed: 100, reason: 'resignation' })).toBe(3200)
  })
})

describe('buildWpsCsvDraft', () => {
  it('writes labour and routing columns', () => {
    const csv = buildWpsCsvDraft(
      [
        {
          employeeCode: 'E1',
          employeeName: 'Ada',
          iban: VALID_AE_IBAN,
          labourCardNo: '12345678901234',
          routingCode: '123456789',
          amountAed: 12.5,
        },
      ],
      '2026-11-15',
    )
    expect(csv.split('\n')).toEqual([
      'EmployeeCode,EmployeeName,LabourCard,RoutingCode,IBAN,AmountAED,ValueDate',
      `E1,Ada,12345678901234,123456789,${VALID_AE_IBAN},12.50,2026-11-15`,
    ])
  })
})

describe('buildWpsSifDraft', () => {
  it('emits banner, SCR, and EDR rows', () => {
    const body = buildWpsSifDraft(
      { employerUniqueId: '100000', bankLabel: 'DRAFT' },
      { payStartIso: '2026-11-01', payEndIso: '2026-11-30' },
      [
        {
          employeeCode: 'E1',
          employeeName: 'Ada Lovelace',
          iban: VALID_AE_IBAN,
          labourCardNo: '12345678901234',
          routingCode: '123456789',
          amountAed: 5000,
          fixedIncomeAed: 5000,
          variableIncomeAed: 0,
        },
      ],
      '2026-11-15T10:00:00.000Z',
    )
    const lines = body.split('\n')
    expect(lines[0]).toContain('DRAFT')
    expect(lines[0]).toContain('not bank-certified')
    expect(lines.find((l) => l.startsWith('SCR,'))).toMatch(/^SCR,100000,20261115,1,5000.00,AED,DRAFT$/)
    expect(lines.find((l) => l.startsWith('EDR,'))).toContain(VALID_AE_IBAN)
    expect(lines.find((l) => l.startsWith('EDR,'))).toContain('12345678901234')
  })
})

describe('validateAeIban', () => {
  it('accepts a mod-97 valid AE IBAN', () => {
    expect(validateAeIban(VALID_AE_IBAN)).toBe(true)
    expect(validateAeIban('AE00')).toBe(false)
    expect(validateAeIban('GB82WEST12345698765432')).toBe(false)
  })
})

describe('validateLabourCardNo / validateRoutingCode', () => {
  it('checks digit length bands', () => {
    expect(validateLabourCardNo('123456789')).toBe(true)
    expect(validateLabourCardNo('12')).toBe(false)
    expect(validateRoutingCode('123456789')).toBe(true)
    expect(validateRoutingCode('123')).toBe(false)
  })
})

describe('wpsFileReadiness', () => {
  it('flags missing employer and line fields', () => {
    const r = wpsFileReadiness({ employerUniqueId: '' }, [
      { employeeCode: 'E1', employeeName: 'Ada', iban: '', amountAed: 0 },
    ])
    expect(r.ready).toBe(false)
    expect(r.issues.some((i) => i.includes('employer'))).toBe(true)
  })

  it('is ready when employer + validated line fields are present', () => {
    const r = wpsFileReadiness({ employerUniqueId: '100000' }, [
      {
        employeeCode: 'E1',
        employeeName: 'Ada',
        iban: VALID_AE_IBAN,
        labourCardNo: '12345678901234',
        routingCode: '123456789',
        amountAed: 100,
      },
    ])
    expect(r.ready).toBe(true)
  })
})

describe('periodBoundsFromYyyyMm / daysInclusive', () => {
  it('returns month bounds and inclusive days', () => {
    expect(periodBoundsFromYyyyMm('2026-11')).toEqual({
      payStartIso: '2026-11-01',
      payEndIso: '2026-11-30',
    })
    expect(daysInclusive('2026-11-01', '2026-11-30')).toBe(30)
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
