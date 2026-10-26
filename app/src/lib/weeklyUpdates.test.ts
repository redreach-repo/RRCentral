import { describe, expect, it } from 'vitest'
import { buildAiRequest, newNumbers, normaliseAiInput } from './aiAssist'
import {
  clientWordsFor,
  draftBody,
  factLines,
  hasNews,
  sendProblem,
  updateCandidates,
  updateEmail,
  updateFacts,
  updateTimelineText,
  weekStartFor,
  whatsAppLink,
  type UpdateIssue,
} from './weeklyUpdates'

const issue = (over: Partial<UpdateIssue> = {}): UpdateIssue => ({
  account_id: 'a1',
  subject: 'Report export times out',
  status: 'open',
  channel: 'ctrm_next',
  vendor_status: 'raised',
  vendor_ticket_ref: '',
  vendor_fixed_at: null,
  resolved_at: null,
  ...over,
})

// Thursday 30 October 2026; the week started on Monday 26 October.
const WEEK = '2026-10-26'
const TODAY = '2026-10-29'

describe('weekStartFor', () => {
  it('gives the Monday of the week', () => {
    expect(weekStartFor(new Date('2026-10-29T12:00:00'))).toBe(WEEK)
    expect(weekStartFor(new Date('2026-10-26T12:00:00'))).toBe(WEEK)
    expect(weekStartFor(new Date('2026-11-01T12:00:00'))).toBe(WEEK)
  })
})

describe('updateCandidates', () => {
  const accounts = [
    { id: 'a1', name: 'Zeta Trading', type: 'ctrm_prospect' },
    { id: 'a2', name: 'Alpha Energy', type: 'ctrm_prospect' },
    { id: 'a3', name: 'Prospect Only', type: 'ctrm_prospect' },
    { id: 'a4', name: 'AI client', type: 'ai_crm_client' },
    { id: 'a5', name: 'Old', type: 'ctrm_prospect', status: 'archived' },
  ]
  const deals = [
    { account_id: 'a1', stage: 'signed' },
    { account_id: 'a2', stage: 'signed' },
    { account_id: 'a3', stage: 'evaluating' },
    { account_id: 'a4', stage: 'signed' },
    { account_id: 'a5', stage: 'signed' },
  ]
  it('takes CTRM Next clients with a signed deal, by name, skipping ones already drafted', () => {
    expect(updateCandidates({ accounts, deals, existing: [], weekStart: WEEK }).map((a) => a.id)).toEqual(['a2', 'a1'])
    expect(
      updateCandidates({ accounts, deals, existing: [{ account_id: 'a2', week_start: WEEK }, { account_id: 'a1', week_start: '2026-10-19' }], weekStart: WEEK }).map((a) => a.id),
    ).toEqual(['a1'])
  })
})

describe('updateFacts', () => {
  const base = { accountId: 'a1', sessions: [], deals: [], weekStart: WEEK, today: TODAY }

  it('splits fixed this week from still open, in client words', () => {
    const f = updateFacts({
      ...base,
      issues: [
        issue({ subject: 'Fixed by vendor', vendor_status: 'fixed', vendor_fixed_at: '2026-10-27T08:00:00Z' }),
        issue({ subject: 'Closed on Monday', status: 'resolved', vendor_status: 'fixed', resolved_at: '2026-10-26T05:00:00Z' }),
        issue({ subject: 'Closed last week', status: 'resolved', resolved_at: '2026-10-24T05:00:00Z' }),
        issue({ subject: 'Margin screen slow', vendor_status: 'in_progress', vendor_ticket_ref: ' CN-123 ' }),
        issue({ subject: 'Old fix still open', vendor_status: 'fixed', vendor_fixed_at: '2026-10-20T08:00:00Z' }),
        issue({ subject: 'Other client', account_id: 'a2' }),
        issue({ subject: 'Not CTRM', channel: 'email' }),
      ],
    })
    expect(f.fixed).toEqual(['Fixed by vendor', 'Closed on Monday'])
    expect(f.open).toEqual([
      'Margin screen slow: the CTRM Next team is working on it (ref CN-123)',
      'Old fix still open: fixed by the CTRM Next team, we are checking it with you',
    ])
  })

  it('counts the week from Monday 00:00 Dubai time', () => {
    // Sunday 21:00 UTC is Monday 01:00 in Dubai.
    const f = updateFacts({ ...base, issues: [issue({ status: 'resolved', resolved_at: '2026-10-25T21:00:00Z' }), issue({ subject: 'Sunday', status: 'resolved', resolved_at: '2026-10-25T19:00:00Z' })] })
    expect(f.fixed).toEqual(['Report export times out'])
  })

  it('gives the next session and the next dated step', () => {
    const f = updateFacts({
      ...base,
      issues: [],
      sessions: [
        { account_id: 'a1', kind: 'review', session_date: '2026-11-12', topics_left: [] },
        { account_id: 'a1', kind: 'training', session_date: '2026-11-03', topics_left: ['Credit', ' ', 'Reporting'] },
        { account_id: 'a1', kind: 'demo', session_date: '2026-10-20', topics_left: [] },
      ],
      deals: [
        { account_id: 'a1', stage: 'signed', next_action: 'Go live sign off', next_action_date: '2026-11-20' },
        { account_id: 'a1', stage: 'signed', next_action: 'Past step', next_action_date: '2026-10-01' },
      ],
    })
    expect(f.next).toEqual(['Training session on Tuesday 3 November: Credit, Reporting', 'Go live sign off by Friday 20 November'])
    expect(hasNews(f)).toBe(true)
    expect(hasNews({ fixed: [], open: [], next: [] })).toBe(false)
  })

  it('words every vendor status for the client', () => {
    expect(clientWordsFor('')).toBe('we are looking into it')
    expect(clientWordsFor('waiting_for_client')).toBe('waiting for a reply from your side')
    expect(clientWordsFor('unknown')).toBe('we are looking into it')
  })
})

describe('the draft', () => {
  const facts = { fixed: ['Report export times out'], open: ['Margin screen slow: raised with the CTRM Next team'], next: [] }

  it('is built only from the facts', () => {
    const body = draftBody({ contactName: 'Sara Khan', facts, companyName: 'Red Reach Middle East FZE' })
    expect(body).toContain('Hi Sara,')
    expect(body).toContain('Fixed this week:\n- Report export times out')
    expect(body).toContain('Still open:\n- Margin screen slow: raised with the CTRM Next team')
    expect(body).not.toContain('Coming up:')
    expect(body).toContain('The Red Reach team')
    expect(draftBody({ contactName: '', facts, companyName: '' })).toMatch(/^Hello,/)
    expect(factLines(facts)).toEqual(['Fixed this week: Report export times out', 'Still open: Margin screen slow: raised with the CTRM Next team'])
  })

  it('never carries a price or fee', () => {
    const body = draftBody({ contactName: 'Sara', facts, companyName: 'Red Reach' })
    expect(body).not.toMatch(/AED|USD|\$|price|fee/i)
  })

  it('is checked before sending', () => {
    const body = 'Hi Sara, here is your update for the week.'
    expect(sendProblem({ status: 'draft', body, channel: 'email' })).toBeNull()
    expect(sendProblem({ status: 'sent', body, channel: 'email' })).toMatch(/already sent/)
    expect(sendProblem({ status: 'skipped', body, channel: 'email' })).toMatch(/skipped/)
    expect(sendProblem({ status: 'draft', body: 'short', channel: 'email' })).toMatch(/Write/)
    expect(sendProblem({ status: 'draft', body: 'x'.repeat(4001), channel: 'email' })).toMatch(/under 4000/)
    expect(sendProblem({ status: 'draft', body, channel: 'sms' })).toMatch(/Pick/)
  })

  it('builds the email, the WhatsApp link and the timeline line', () => {
    expect(updateEmail({ accountName: 'Zeta Trading', weekStart: WEEK, body: ' Hi \n' })).toEqual({
      subject: 'Zeta Trading: CTRM Next update, week of 26 October 2026',
      body: 'Hi',
    })
    expect(whatsAppLink('+971 50 123 4567', 'Hi Sara,\nFixed: A & B')).toBe('https://wa.me/971501234567?text=Hi%20Sara%2C%0AFixed%3A%20A%20%26%20B')
    expect(updateTimelineText({ weekStart: WEEK, channel: 'whatsapp', to: '971501234567', sentBy: 'alfred@redreach.ae' })).toBe(
      'Weekly CTRM Next update (week of 26 October 2026) sent by WhatsApp to 971501234567, approved by alfred@redreach.ae.',
    )
  })
})

describe('Tidy wording with AI', () => {
  it('asks for wording only and keeps the text within bounds', () => {
    const input = normaliseAiInput({ feature: 'update_tidy', accountName: 'Zeta', text: 'Hi Sara, the export is fixed now.' })
    expect(input).toEqual({ feature: 'update_tidy', accountName: 'Zeta', text: 'Hi Sara, the export is fixed now.' })
    const req = buildAiRequest(input!)
    expect(req.system).toMatch(/never add a fact, number, date/)
    expect(req.schema).toBeNull()
    expect(normaliseAiInput({ feature: 'update_tidy', accountName: 'Zeta', text: 'too short' })).toBeNull()
  })

  it('spots a number the tidied text brought in', () => {
    const before = 'Training session on Tuesday 3 November. Ref CN-123.'
    expect(newNumbers(before, 'Your training is on Tuesday 3 November (ref CN-123).')).toEqual([])
    expect(newNumbers(before, 'Training on Tuesday 3 November at 10:00, fixed in 2 days.')).toEqual(['10:00', '2'])
    expect(newNumbers('Price 1,500', 'Price 1,500.50')).toEqual(['1,500.50'])
  })
})
