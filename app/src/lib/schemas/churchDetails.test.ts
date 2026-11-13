import { describe, expect, it } from 'vitest'
import { parseChurchDetailsForm } from './churchDetails'

const base = {
  tenant_slug: 'icoc-uae',
  plan: 'Pro',
  modules: 'Events, Giving',
  whatsapp_month: '2026-11',
  whatsapp_conversations: '42',
  billing_status: 'active',
  renewal_date: '2027-01-01',
  admin_url: 'https://admin.example.com',
  notes: ' note ',
}

describe('parseChurchDetailsForm', () => {
  it('accepts a valid draft and normalises fields', () => {
    const r = parseChurchDetailsForm(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.tenant_slug).toBe('icoc-uae')
    expect(r.data.modules).toEqual(['Events', 'Giving'])
    expect(r.data.whatsapp_conversations).toBe(42)
    expect(r.data.notes).toBe('note')
  })

  it('rejects bad slug', () => {
    const r = parseChurchDetailsForm({ ...base, tenant_slug: 'ICOC UAE' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/slug/i)
  })

  it('rejects non-https admin url', () => {
    const r = parseChurchDetailsForm({ ...base, admin_url: 'http://x' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/https/i)
  })

  it('rejects fractional conversation counts', () => {
    const r = parseChurchDetailsForm({ ...base, whatsapp_conversations: '12.5' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/whole number/i)
  })

  it('allows empty optional fields', () => {
    const r = parseChurchDetailsForm({
      ...base,
      tenant_slug: '',
      admin_url: '',
      whatsapp_conversations: '',
      billing_status: '',
      renewal_date: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.whatsapp_conversations).toBeNull()
    expect(r.data.billing_status).toBe('')
  })
})
