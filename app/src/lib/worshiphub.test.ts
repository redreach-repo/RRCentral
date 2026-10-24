import { describe, expect, it } from 'vitest'
import { churchDetailsProblem, churchView, hasBillingIssue, joinRequests, renewalSoon, sanitiseTenant, sanitiseTenants } from './worshiphub'
import type { WorshipChurchProfile } from './types'

const row = {
  slug: 'icoc-uae',
  name: 'ICOC UAE',
  plan: 'Standard',
  modules: ['events', 'giving', 'events'],
  whatsapp_month: '2026-10',
  whatsapp_marketing: 120,
  whatsapp_service: '45',
  whatsapp_utility: 3,
  billing_status: 'active',
  renewal_date: '2027-01-15',
  admin_url: 'https://admin.example.test/icoc-uae',
}

describe('sanitiseTenant', () => {
  it('keeps only the agreed fields', () => {
    const t = sanitiseTenant({ ...row, members: [{ name: 'Someone' }], visitors: 4, email: 'x@y.z' })
    expect(Object.keys(t!).sort()).toEqual(
      [
        'admin_url', 'billing_status', 'contact_email', 'contact_name', 'modules', 'name', 'plan',
        'registered_at', 'renewal_date', 'review_status', 'slug', 'user_count',
        'whatsapp_marketing', 'whatsapp_month', 'whatsapp_service', 'whatsapp_utility',
      ].sort(),
    )
    expect(t!.modules).toEqual(['events', 'giving'])
    expect(t!.whatsapp_service).toBe(45)
  })

  it('drops bad values instead of trusting them', () => {
    const t = sanitiseTenant({
      ...row,
      billing_status: 'owes us',
      renewal_date: 'soon',
      whatsapp_month: '2026-13',
      whatsapp_marketing: -5,
      admin_url: 'javascript:alert(1)',
    })
    expect(t).toMatchObject({ billing_status: '', renewal_date: null, whatsapp_month: '', whatsapp_marketing: 0, admin_url: '' })
  })

  it('rejects rows without a valid slug', () => {
    expect(sanitiseTenant({ ...row, slug: 'Bad slug!' })).toBeNull()
    expect(sanitiseTenant(null)).toBeNull()
    expect(sanitiseTenant(['icoc-uae'])).toBeNull()
  })
})

describe('sanitiseTenants', () => {
  it('reads a wrapped list or a bare array and removes duplicates', () => {
    expect(sanitiseTenants({ tenants: [row, row] })).toHaveLength(1)
    expect(sanitiseTenants([row, { ...row, slug: 'icoc-abu-dhabi' }])).toHaveLength(2)
    expect(sanitiseTenants({ error: 'nope' })).toEqual([])
  })
})

describe('churchView', () => {
  const profile = {
    plan: 'Basic',
    modules: ['events'],
    whatsapp_month: '2026-09',
    whatsapp_conversations: 80,
    billing_status: 'trial',
    renewal_date: '2026-12-01',
    admin_url: 'https://manual.example.test',
  } as WorshipChurchProfile

  it('prefers live values and totals WhatsApp', () => {
    const v = churchView(profile, sanitiseTenant(row))
    expect(v).toMatchObject({ source: 'live', plan: 'Standard', whatsappTotal: 168, billingStatus: 'active' })
  })

  it('falls back to what was entered by hand', () => {
    const v = churchView(profile, null)
    expect(v).toMatchObject({ source: 'manual', plan: 'Basic', whatsappTotal: 80, whatsappSplit: null })
  })

  it('keeps the manual admin link when WorshipHub sends none', () => {
    expect(churchView(profile, sanitiseTenant({ ...row, admin_url: '' })).adminUrl).toBe('https://manual.example.test')
  })
})

describe('flags', () => {
  it('flags renewals within 60 days and billing problems', () => {
    const now = new Date(2026, 9, 23)
    expect(renewalSoon('2026-12-20', now)).toBe(true)
    expect(renewalSoon('2027-01-15', now)).toBe(false)
    expect(renewalSoon(null, now)).toBe(false)
    expect(hasBillingIssue('past_due')).toBe(true)
    expect(hasBillingIssue('active')).toBe(false)
  })
})

describe('churchDetailsProblem', () => {
  it('checks slug, link and count', () => {
    const ok = { tenant_slug: 'icoc-uae', admin_url: '', whatsapp_conversations: '' }
    expect(churchDetailsProblem(ok)).toBeNull()
    expect(churchDetailsProblem({ ...ok, tenant_slug: 'ICOC UAE' })).toMatch(/slug/)
    expect(churchDetailsProblem({ ...ok, admin_url: 'http://x' })).toMatch(/https/)
    expect(churchDetailsProblem({ ...ok, whatsapp_conversations: '12.5' })).toMatch(/whole number/)
  })
})

describe('join requests', () => {
  it('reads the review fields and blanks bad ones', () => {
    const t = sanitiseTenant({
      ...row,
      review_status: 'pending',
      registered_at: '2026-10-20T10:00:00Z',
      contact_name: 'Sam Lee',
      contact_email: 'Pastor@Grace.example',
      user_count: 4,
    })
    expect(t).toMatchObject({
      review_status: 'pending',
      registered_at: '2026-10-20T10:00:00.000Z',
      contact_email: 'pastor@grace.example',
      user_count: 4,
    })
    const bad = sanitiseTenant({ ...row, review_status: 'maybe', registered_at: 'yesterday', contact_email: 'not an email' })
    expect(bad).toMatchObject({ review_status: '', registered_at: null, contact_email: '', user_count: null })
  })

  it('lists only pending churches, newest first', () => {
    const list = sanitiseTenants([
      { ...row, slug: 'old', review_status: 'pending', registered_at: '2026-10-01T00:00:00Z' },
      { ...row, slug: 'done', review_status: 'approved', registered_at: '2026-10-22T00:00:00Z' },
      { ...row, slug: 'new', review_status: 'pending', registered_at: '2026-10-21T00:00:00Z' },
    ])
    expect(joinRequests(list).map((t) => t.slug)).toEqual(['new', 'old'])
  })

  it('keeps WhatsApp counts entered by hand when WorshipHub sends none', () => {
    const live = sanitiseTenant({ ...row, whatsapp_month: '', whatsapp_marketing: 0 })!
    const profile = { whatsapp_month: '2026-09', whatsapp_conversations: 80 } as WorshipChurchProfile
    expect(churchView(profile, live)).toMatchObject({ source: 'live', whatsappMonth: '2026-09', whatsappTotal: 80, whatsappSplit: null })
  })
})
