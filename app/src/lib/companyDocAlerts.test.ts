import { describe, expect, it } from 'vitest'
import { companyDocAlertLabel, companyDocExpiryAlerts } from './companyDocAlerts'
import type { CompanyDocument } from './types'

function doc(partial: Partial<CompanyDocument> & { id: string; expires_on: string }): CompanyDocument {
  return {
    title: partial.title || 'Doc',
    category: partial.category || 'trade_license',
    file_name: partial.file_name || '',
    drive_url: partial.drive_url || '',
    notes: '',
    storage_provider: 'workdrive',
    uploaded_by: '',
    uploaded_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('companyDocExpiryAlerts', () => {
  const today = new Date('2026-10-06T12:00:00.000Z')

  it('flags overdue, soon, and upcoming within window', () => {
    const alerts = companyDocExpiryAlerts(
      [
        doc({ id: '1', title: 'Trade license', expires_on: '2026-09-01' }),
        doc({ id: '2', title: 'VAT', category: 'vat_certificate', expires_on: '2026-10-20' }),
        doc({ id: '3', title: 'Insurance', expires_on: '2026-11-20' }),
        doc({ id: '4', title: 'Far', expires_on: '2027-06-01' }),
      ],
      60,
      today,
    )
    expect(alerts.map((a) => a.id)).toEqual(['1', '2', '3'])
    expect(alerts[0].severity).toBe('overdue')
    expect(alerts[1].severity).toBe('soon')
    expect(alerts[2].severity).toBe('upcoming')
    expect(companyDocAlertLabel(alerts[0])).toMatch(/Expired/)
    expect(companyDocAlertLabel(alerts[1])).toMatch(/Expires in/)
  })

  it('skips docs without expires_on', () => {
    const alerts = companyDocExpiryAlerts(
      [doc({ id: 'x', expires_on: '', title: 'No date' })],
      60,
      today,
    )
    expect(alerts).toEqual([])
  })
})
