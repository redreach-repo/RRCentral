import { describe, expect, it } from 'vitest'
import { parseDomainForm } from './domain'

const base = {
  domain_name: 'RedReach.ae',
  registrar: 'GoDaddy',
  registrar_account: '',
  status: 'active' as const,
  registered_on: '',
  expires_on: '2027-01-01',
  auto_renew: true,
  dns_provider: '',
  nameservers: '',
  hosting_provider: '',
  website_url: '',
  managed_by: '',
  cost_aed: '120',
  billing_cycle: 'annual' as const,
  notes: '',
}

describe('parseDomainForm', () => {
  it('requires a dotted domain name', () => {
    const r = parseDomainForm({ ...base, domain_name: 'nodot' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/domain/i)
  })

  it('normalises the domain name', () => {
    const r = parseDomainForm(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.domain_name).toBe('redreach.ae')
  })

  it('rejects a non-numeric renewal cost', () => {
    const r = parseDomainForm({ ...base, cost_aed: 'abc' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/cost|number/i)
  })

  it('allows an empty renewal cost', () => {
    const r = parseDomainForm({ ...base, cost_aed: '' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.cost_aed).toBeNull()
  })
})
