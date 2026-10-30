import { describe, expect, it } from 'vitest'
import { billToLines, missingBillToFields, resolveBillToParty, type BillToParty } from './clientLookup'
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

describe('billToLines', () => {
  const massAllied = resolveBillToParty('Mass Allied Freighters', null, null)

  it('puts address then TRN straight under the client name, like the Mass Allied invoice', () => {
    const lines = billToLines(massAllied)
    expect(lines.map((l) => l.text)).toEqual([
      'Grosvenor Business Tower, Office 1506,',
      'P.O. Box 6641, Barsha Heights, TECOM,',
      'Dubai, UAE',
      'TRN: 100286214000003',
      'Tel: +971 4 882 4433',
    ])
  })

  it('keeps contact, email and phone after address and TRN', () => {
    const party: BillToParty = {
      companyName: 'Acme',
      primaryContact: 'Sara',
      email: 'sara@acme.ae',
      phone: '050 000 0000',
      address: 'Office 1, Dubai',
      trn: '123',
    }
    expect(billToLines(party).map((l) => l.kind)).toEqual(['address', 'trn', 'contact', 'email', 'phone'])
  })

  it('leaves out missing address and TRN without blank lines', () => {
    const party: BillToParty = { companyName: 'Acme', primaryContact: '', email: '', phone: '', address: ' \n ', trn: '' }
    expect(billToLines(party)).toEqual([])
    expect(missingBillToFields(party)).toEqual(['address', 'TRN'])
  })

  it('reports nothing missing for a complete client', () => {
    expect(missingBillToFields(massAllied)).toEqual([])
  })
})
