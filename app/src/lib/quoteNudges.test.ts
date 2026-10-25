import { describe, expect, it } from 'vitest'
import { buildDigest, digestSections } from './dailyDigest'
import {
  BUILT_IN_FOLLOWUP,
  canEditTemplates,
  canSendNudges,
  pickTemplate,
  quoteNudges,
  renderTemplate,
  templateProblem,
  unknownFields,
  type MessageTemplate,
  type NudgeDeal,
  type NudgeQuote,
} from './quoteNudges'

const now = new Date('2026-10-25T10:00:00Z')

const tpl = (over: Partial<MessageTemplate>): MessageTemplate => ({
  id: 't',
  name: 'T',
  division_code: '',
  channel: 'whatsapp',
  purpose: 'quote_followup',
  subject: '',
  body: 'Hi {{name}}',
  active: true,
  ...over,
})

describe('pickTemplate', () => {
  const templates = [
    tpl({ id: 'all', division_code: '' }),
    tpl({ id: 'threads', division_code: '01' }),
    tpl({ id: 'off', division_code: '02', active: false }),
    tpl({ id: 'mail', channel: 'email', subject: 'S' }),
  ]
  it("uses the division's own, then every division, then the built in one", () => {
    expect(pickTemplate(templates, { division: '01', channel: 'whatsapp', purpose: 'quote_followup' }).id).toBe('threads')
    expect(pickTemplate(templates, { division: '02', channel: 'whatsapp', purpose: 'quote_followup' }).id).toBe('all')
    expect(pickTemplate(templates, { division: '03', channel: 'email', purpose: 'quote_followup' }).id).toBe('mail')
    expect(pickTemplate([], { division: '03', channel: 'email', purpose: 'quote_followup' })).toMatchObject({
      id: null,
      subject: BUILT_IN_FOLLOWUP.email.subject,
    })
  })
})

describe('renderTemplate', () => {
  const values = { name: 'Sara', account: 'Clinic LLC', quote_number: 'RR-03-26014', amount: 'AED 4,500.00', link: '', company: 'Red Reach' }
  it('fills the merge fields and drops a line with only an empty link', () => {
    const r = renderTemplate(BUILT_IN_FOLLOWUP.whatsapp, values)
    expect(r.body).toContain('Hello Sara')
    expect(r.body).toContain('RR-03-26014 for Clinic LLC (AED 4,500.00)')
    expect(r.body).not.toContain('{{')
    expect(r.body).not.toMatch(/\n\n\n/)
    const withLink = renderTemplate(BUILT_IN_FOLLOWUP.whatsapp, { ...values, link: 'https://x/accept#t' })
    expect(withLink.body).toContain('https://x/accept#t')
  })

  it('greets "there" without a contact name', () => {
    expect(renderTemplate({ subject: '', body: 'Hello {{name}}' }, { ...values, name: '' }).body).toBe('Hello there')
  })

  it('fills the email subject', () => {
    expect(renderTemplate(BUILT_IN_FOLLOWUP.email, values).subject).toBe('Quote RR-03-26014 for Clinic LLC')
  })
})

describe('templateProblem', () => {
  it('catches missing parts and unknown fields', () => {
    expect(templateProblem({ name: '', channel: 'whatsapp', subject: '', body: 'x' })).toMatch(/name/)
    expect(templateProblem({ name: 'A', channel: 'email', subject: '', body: 'x' })).toMatch(/subject/)
    expect(templateProblem({ name: 'A', channel: 'whatsapp', subject: '', body: 'Hi {{nmae}}' })).toMatch(/nmae/)
    expect(templateProblem({ name: 'A', channel: 'whatsapp', subject: '', body: 'Hi {{name}}' })).toBeNull()
    expect(unknownFields('{{amount}} {{foo}} {{foo}}')).toEqual(['foo'])
  })
})

const quote = (over: Partial<NudgeQuote>): NudgeQuote => ({
  id: 'q1',
  client: 'Clinic LLC',
  reference_number: 'RR-03-26014',
  division_code: '03',
  amount: 4500,
  status: 'Sent',
  account_id: null,
  quotation_currency: 'AED',
  sent_at: '2026-10-21T09:00:00Z',
  followed_up_at: null,
  ...over,
})

const deal = (over: Partial<NudgeDeal>): NudgeDeal => ({
  id: 'd1',
  account_id: 'a1',
  stage: 'quote_sent',
  quote_reference: '',
  monthly_fee: 3000,
  last_touch_at: '2026-10-20T09:00:00Z',
  quote_sent_at: '2026-10-19T09:00:00Z',
  ...over,
})

describe('quoteNudges', () => {
  const accountNames = new Map([['a1', 'Dental Co']])
  it('lists quotes sent 3 or more days ago with no follow up since, longest first', () => {
    const list = quoteNudges({
      quotes: [
        quote({}),
        quote({ id: 'fresh', sent_at: '2026-10-24T09:00:00Z' }),
        quote({ id: 'followed', followed_up_at: '2026-10-24T09:00:00Z' }),
        quote({ id: 'won', status: 'Awarded' }),
        quote({ id: 'unknown', sent_at: null }),
      ],
      deals: [deal({}), deal({ id: 'touched', last_touch_at: '2026-10-24T09:00:00Z' }), deal({ id: 'lead', stage: 'lead' })],
      accountNames,
      now,
    })
    expect(list.map((n) => n.key)).toEqual(['deal:d1', 'quote:q1'])
    expect(list[0]).toMatchObject({ account: 'Dental Co', days: 5, division: '07', amount: 'AED 3,000.00 a month' })
    expect(list[1]).toMatchObject({ days: 4, amount: 'AED 4,500.00', path: '/document/quote/q1' })
  })

  it('shows in the digest only when there are any', () => {
    const base = { now, accounts: [], contracts: [], packages: [], entries: [], tickets: [], deals: [] }
    expect(digestSections(buildDigest(base)).some((s) => s.key === 'quoteNudges')).toBe(false)
    const section = digestSections(buildDigest({ ...base, sentQuotes: [quote({})] })).find((s) => s.key === 'quoteNudges')
    expect(section?.items[0]).toMatchObject({ name: 'Clinic LLC', path: '/crm?follow=Due' })
  })
})

describe('who edits and sends', () => {
  it.each([
    ['admin', true, true],
    ['manager', true, true],
    ['sales', false, true],
    ['staff', false, false],
    ['viewer', false, false],
  ])('%s: edits templates %s, sends nudges %s', (role, edit, send) => {
    expect(canEditTemplates(role)).toBe(edit)
    expect(canSendNudges(role)).toBe(send)
  })
})
