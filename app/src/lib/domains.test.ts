import { describe, expect, it } from 'vitest'
import { domainAlertLabel, domainRenewalAlerts } from './domainAlerts'
import { domainStatusLabel, normalizeDomainName } from './domains'
import type { OwnedDomain } from './types'

describe('domains', () => {
  it('normalizes domain names to apex hostnames', () => {
    expect(normalizeDomainName('https://www.RedReach.ae/path')).toBe('redreach.ae')
    expect(normalizeDomainName('CRM.redreach.ae.')).toBe('crm.redreach.ae')
    expect(normalizeDomainName('  teetribe.com  ')).toBe('teetribe.com')
  })

  it('labels statuses', () => {
    expect(domainStatusLabel('active')).toBe('Active')
    expect(domainStatusLabel('parked')).toBe('Parked')
  })

  it('flags renewals within the window', () => {
    const today = new Date('2026-10-08T12:00:00Z')
    const rows = [
      {
        id: '1',
        domain_name: 'soon.example',
        expires_on: '2026-10-20',
        registrar: 'GoDaddy',
        auto_renew: false,
        active: true,
      },
      {
        id: '2',
        domain_name: 'later.example',
        expires_on: '2027-06-01',
        registrar: '',
        auto_renew: true,
        active: true,
      },
      {
        id: '3',
        domain_name: 'gone.example',
        expires_on: '2026-09-01',
        registrar: '',
        auto_renew: false,
        active: true,
      },
    ] as OwnedDomain[]
    const alerts = domainRenewalAlerts(rows, 90, today)
    expect(alerts.map((a) => a.domainName)).toEqual(['gone.example', 'soon.example'])
    expect(alerts[0].severity).toBe('overdue')
    expect(domainAlertLabel(alerts[0])).toMatch(/Expired/)
    expect(alerts[1].severity).toBe('soon')
  })
})
