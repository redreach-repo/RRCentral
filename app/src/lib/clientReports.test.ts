import { describe, expect, it } from 'vitest'
import {
  factsForReport,
  reportCandidates,
  reportEmail,
  reportMonthFor,
  reportRecipients,
  reportTimelineText,
  reportWhatsAppValues,
  sendProblem,
} from './clientReports'
import { buildPortalView } from './clientPortal'
import { DEFAULT_DELIVERY_RATES } from './delivery'

describe('reportMonthFor', () => {
  it('reports on the month just ended', () => {
    expect(reportMonthFor(new Date('2026-11-01T06:00:00Z'))).toBe('2026-10-01')
    expect(reportMonthFor(new Date('2027-01-01T06:00:00Z'))).toBe('2026-12-01')
  })
})

describe('reportCandidates', () => {
  const accounts = [
    { id: 'a', name: 'Zed Clinic', type: 'ai_crm_client' },
    { id: 'b', name: 'Alpha Dental', type: 'ai_crm_client' },
    { id: 'c', name: 'Church', type: 'worship_church' },
    { id: 'd', name: 'Old Client', type: 'ai_crm_client' },
    { id: 'e', name: 'Later Client', type: 'ai_crm_client' },
    { id: 'f', name: 'Draft Contract', type: 'ai_crm_client' },
  ]
  const contracts = [
    { account_id: 'a', status: 'active', term_start: '2026-06-01', term_end: '2027-05-31' },
    { account_id: 'b', status: 'active', term_start: '2026-10-15', term_end: null },
    { account_id: 'c', status: 'active', term_start: '2026-01-01', term_end: null },
    { account_id: 'd', status: 'active', term_start: '2025-01-01', term_end: '2026-09-30' },
    { account_id: 'e', status: 'active', term_start: '2026-11-01', term_end: null },
    { account_id: 'f', status: 'draft', term_start: '2026-01-01', term_end: null },
  ]
  it('takes AI CRM clients with a contract running that month, by name', () => {
    const out = reportCandidates({ accounts, contracts, existing: [], month: '2026-10-01' })
    expect(out.map((a) => a.id)).toEqual(['b', 'a'])
  })
  it('skips clients that already have a draft for the month', () => {
    const out = reportCandidates({ accounts, contracts, existing: [{ account_id: 'a', month: '2026-10-01' }, { account_id: 'b', month: '2026-09-01' }], month: '2026-10-01' })
    expect(out.map((a) => a.id)).toEqual(['b'])
  })
})

describe('factsForReport', () => {
  it('uses the same numbers as the portal report', () => {
    const view = buildPortalView({
      now: new Date('2026-10-31T12:00:00Z'),
      month: '2026-10-01',
      companyName: 'Red Reach Middle East FZE',
      account: { name: 'Bright Smile', reference: '' },
      contracts: [],
      packages: [],
      stages: [],
      requirements: [],
      tickets: [],
      usage: [],
      entries: [{ date: '2026-10-03', hours: 4, category: 'build' }],
      rates: DEFAULT_DELIVERY_RATES,
    })
    const facts = factsForReport(view)
    expect(facts[0]).toMatch(/^4 hours worked/)
    expect(facts).toContain('No usage recorded for the month yet')
  })
})

describe('sendProblem', () => {
  const ok = { status: 'draft', summary: 'A good month with everything on track.', channels: ['email'] }
  it('lets a checked draft go', () => {
    expect(sendProblem(ok)).toBeNull()
  })
  it('refuses sent, skipped, empty or channel-less drafts', () => {
    expect(sendProblem({ ...ok, status: 'sent' })).toMatch(/already/)
    expect(sendProblem({ ...ok, status: 'skipped' })).toMatch(/skipped/)
    expect(sendProblem({ ...ok, summary: 'short' })).toMatch(/summary/)
    expect(sendProblem({ ...ok, channels: [] })).toMatch(/Pick/)
    expect(sendProblem({ ...ok, channels: ['sms'] })).toMatch(/Unknown/)
  })
})

describe('messages', () => {
  it('writes the email with the summary and the exact numbers', () => {
    const { subject, body } = reportEmail({
      contactName: 'Sara Ali',
      accountName: 'Bright Smile',
      month: '2026-10-01',
      summary: 'October went well.',
      facts: ['4 hours worked', 'Usage stayed within the plan'],
      companyName: 'Red Reach Middle East FZE',
      senderName: 'alfred',
    })
    expect(subject).toBe('Bright Smile: your October 2026 report from Red Reach')
    expect(body).toContain('Hi Sara,')
    expect(body).toContain('October went well.')
    expect(body).toContain('- 4 hours worked')
    expect(body).toContain('alfred, Red Reach')
  })
  it('flattens the WhatsApp values and keeps them short', () => {
    const v = reportWhatsAppValues({ contactName: '', month: '2026-10-01', summary: `Line one.\n\nLine two.${' word'.repeat(300)}` })
    expect(v[0]).toBe('there')
    expect(v[1]).toBe('October 2026')
    expect(v[2]).not.toMatch(/\n/)
    expect(v[2].length).toBeLessThanOrEqual(900)
    expect(v[2].endsWith('...')).toBe(true)
  })
  it('picks the primary contact on each channel', () => {
    const c = (p: Partial<{ id: string; name: string; email: string; phone: string; whatsapp: string; is_primary: boolean }>) => ({
      id: 'x', name: '', email: '', phone: '', whatsapp: '', is_primary: false, ...p,
    })
    const to = reportRecipients([c({ id: '1', email: 'a@x.com' }), c({ id: '2', email: 'b@x.com', whatsapp: '0501234567', is_primary: true })])
    expect(to.email?.to).toBe('b@x.com')
    expect(to.whatsapp?.to).toBe('971501234567')
    expect(reportRecipients([]).email).toBeNull()
  })
  it('says what went where on the timeline', () => {
    expect(reportTimelineText({ month: '2026-10-01', sent: [{ channel: 'email', to: 'a@x.com' }], failed: ['WhatsApp: not set up'], sentBy: 'alfred@redreach.ae' })).toBe(
      'October 2026 report sent by email to a@x.com, approved by alfred@redreach.ae. Not sent: WhatsApp: not set up.',
    )
  })
})
