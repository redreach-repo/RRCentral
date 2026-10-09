import { describe, expect, it } from 'vitest'
import { resolveBillToParty } from './clientLookup'
import type { Client, CrmEntry } from './types'

describe('resolveBillToParty', () => {
  it('prefers full clients-row details over the short invoice client label', () => {
    const client: Client = {
      id: '1',
      company_name: 'Mass Allied Freighters L.L.C',
      primary_contact: '',
      email: '',
      mobile: '',
      office: '+971 4 882 4433',
      address: 'Grosvenor Business Tower, Office 1506,\nP.O. Box 6641, Barsha Heights, TECOM,\nDubai, UAE',
      trn: '100286214000003',
      notes: '',
      created_at: '',
    }
    const party = resolveBillToParty('Mass Allied Freighters', client, null)
    expect(party.companyName).toBe('Mass Allied Freighters L.L.C')
    expect(party.phone).toBe('+971 4 882 4433')
    expect(party.trn).toBe('100286214000003')
    expect(party.address).toContain('Grosvenor Business Tower')
  })

  it('falls back to CRM when clients row is missing', () => {
    const crm = {
      id: 'c1',
      company_name: 'Mass Allied Freighters L.L.C',
      primary_contact: '',
      email_phone: '',
      mobile_number: '',
      office_number: '+971 4 882 4433',
      address: 'Dubai, UAE',
      trn: '100286214000003',
    } as CrmEntry
    const party = resolveBillToParty('Mass Allied Freighters', null, crm)
    expect(party.companyName).toBe('Mass Allied Freighters L.L.C')
    expect(party.phone).toBe('+971 4 882 4433')
    expect(party.trn).toBe('100286214000003')
  })

  it('uses known bill-to when clients and CRM are both empty', () => {
    const party = resolveBillToParty('Mass Allied Freighters', null, null)
    expect(party.companyName).toBe('Mass Allied Freighters L.L.C')
    expect(party.phone).toBe('+971 4 882 4433')
    expect(party.trn).toBe('100286214000003')
    expect(party.address).toContain('Grosvenor Business Tower')
  })
})
