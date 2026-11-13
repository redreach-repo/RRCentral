import { describe, expect, it } from 'vitest'
import { parseQuickLeadForm } from './quickLead'

const base = {
  phone: '+971501234567',
  name: 'Sam Buyer',
  company: 'Acme',
  email: '',
  source: 'Phone call',
  pipeline: 'ai_crm' as const,
  note: '',
  countryCode: '971',
}

describe('parseQuickLeadForm', () => {
  it('accepts a minimal valid lead', () => {
    const r = parseQuickLeadForm(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.name).toBe('Sam Buyer')
      expect(r.data.pipeline).toBe('ai_crm')
    }
  })

  it('rejects a short phone', () => {
    const r = parseQuickLeadForm({ ...base, phone: '123' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/phone/i)
  })

  it('rejects a short name', () => {
    const r = parseQuickLeadForm({ ...base, name: 'A' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/name/i)
  })

  it('rejects a bad email when provided', () => {
    const r = parseQuickLeadForm({ ...base, email: 'not-an-email' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/email/i)
  })

  it('accepts a valid optional email', () => {
    const r = parseQuickLeadForm({ ...base, email: 'sam@acme.ae' })
    expect(r.ok).toBe(true)
  })
})
