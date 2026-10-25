import { describe, expect, it } from 'vitest'
import { cleanPhoneInput, quickCallBody, quickLeadNote, quickLeadProblem, quickMatches } from './quickAdd'

const data = {
  accounts: [{ id: 'a1', name: 'Acme', type: 'client' }],
  contacts: [
    { id: 'c1', account_id: 'a1', name: 'Sam', phone: '050 111 2222', whatsapp: '' },
    { id: 'c2', account_id: 'gone', name: 'Old', phone: '0501112222', whatsapp: '' },
  ],
  crm: [{ id: 'r1', company_name: 'Lead Co', primary_contact: 'Ali', mobile_number: '', office_number: '+971501112222', pipeline_stage: 'New' }],
}

describe('quickMatches', () => {
  it('finds contacts and CRM leads by phone in any format', () => {
    const m = quickMatches('+971 50 111 2222', data)
    expect(m.map((x) => `${x.kind}:${x.id}`)).toEqual(['contact:c1', 'crm:r1'])
    expect(m[0]).toMatchObject({ accountName: 'Acme', name: 'Sam' })
  })
  it('finds nothing for a short or unknown number', () => {
    expect(quickMatches('050', data)).toEqual([])
    expect(quickMatches('0559998888', data)).toEqual([])
  })
})

describe('quick add text', () => {
  it('builds the call line', () => {
    expect(quickCallBody('No answer', '  ')).toBe('No answer.')
    expect(quickCallBody('Spoke to them', 'Wants a demo')).toBe('Spoke to them. Wants a demo')
  })
  it('checks a new lead', () => {
    expect(quickLeadProblem({ phone: '05', name: 'Sam' })).toMatch(/phone/)
    expect(quickLeadProblem({ phone: '0501112222', name: 'S' })).toMatch(/name/)
    expect(quickLeadProblem({ phone: '0501112222', name: 'Sam', email: 'nope' })).toMatch(/email/)
    expect(quickLeadProblem({ phone: '0501112222', name: 'Sam', email: '' })).toBeNull()
  })
  it('writes the lead note', () => {
    expect(quickLeadNote('Referral', 'From Ali')).toBe('New lead from Referral (Quick add)\nFrom Ali')
  })
  it('keeps digits and a leading plus', () => {
    expect(cleanPhoneInput(' +971 (50) 111-2222')).toBe('+971501112222')
    expect(cleanPhoneInput('050 111')).toBe('050111')
  })
})
