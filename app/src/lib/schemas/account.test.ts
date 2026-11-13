import { describe, expect, it } from 'vitest'
import { parseAccountForm } from './account'

describe('parseAccountForm', () => {
  it('requires a company name', () => {
    const result = parseAccountForm({
      type: 'ai_crm_client',
      name: '  ',
      industry: '',
      country: 'United Arab Emirates',
      city: '',
      website: '',
      status: 'prospect',
      owner_user_id: null,
      source: '',
      notes: '',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/company name/i)
  })

  it('accepts a valid new account with optional contact', () => {
    const result = parseAccountForm({
      type: 'ctrm_prospect',
      name: ' Quiet Sheet Demo Co ',
      industry: 'Logistics',
      country: 'United Arab Emirates',
      city: 'Dubai',
      website: 'https://example.com',
      status: 'active',
      owner_user_id: 'u1',
      source: 'Referral',
      notes: '',
      contactName: 'Ali',
      contactEmail: 'ali@example.com',
      contactPhone: '0501234567',
      editing: false,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.input.name).toBe('Quiet Sheet Demo Co')
      expect(result.data.contact?.name).toBe('Ali')
      expect(result.data.contact?.email).toBe('ali@example.com')
    }
  })

  it('rejects status that does not belong to the type', () => {
    const result = parseAccountForm({
      type: 'ctrm_prospect',
      name: 'Co',
      industry: '',
      country: '',
      city: '',
      website: '',
      status: 'prospect',
      owner_user_id: null,
      source: '',
      notes: '',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/status/i)
  })

  it('rejects bad contact email when creating', () => {
    const result = parseAccountForm({
      type: 'ai_crm_client',
      name: 'Co',
      industry: '',
      country: '',
      city: '',
      website: '',
      status: 'prospect',
      owner_user_id: null,
      source: '',
      notes: '',
      contactName: 'Ali',
      contactEmail: 'not-an-email',
      editing: false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/email/i)
  })
})
