import { describe, expect, it } from 'vitest'
import {
  AI_MAX_INPUT_CHARS,
  AI_MODEL,
  aiCostUsd,
  assistCostInMonth,
  buildAiRequest,
  normaliseAiInput,
  parseRequirements,
  reportFacts,
  signOffFor,
  threadText,
  tidyAiText,
  type AiThreadMessage,
} from './aiAssist'

const msg = (body: string, who = 'Sara', internal = false): AiThreadMessage => ({ who, when: '3 Nov, 10:00', body, internal })

describe('aiAssist', () => {
  it('uses Haiku', () => {
    expect(AI_MODEL).toBe('claude-haiku-5-5')
  })

  it('prices a call from its tokens', () => {
    expect(aiCostUsd({ input_tokens: 10_000, output_tokens: 1_000 })).toBeCloseTo(0.0015, 6)
    expect(aiCostUsd({ input_tokens: null, output_tokens: undefined })).toBe(0)
    // Prompts over 100K tokens use the higher price for the whole call.
    expect(aiCostUsd({ input_tokens: 200_000, output_tokens: 1_000 })).toBeCloseTo(0.1025, 6)
  })

  it('keeps the first and latest messages of a long thread', () => {
    const long = 'x'.repeat(5_000)
    const messages = [msg('First ask'), ...Array.from({ length: 30 }, (_, i) => msg(`${i} ${long}`)), msg('Latest question')]
    const text = threadText(messages, 20_000)
    expect(text.length).toBeLessThanOrEqual(20_100)
    expect(text).toContain('First ask')
    expect(text).toContain('Latest question')
    expect(text).toMatch(/earlier messages left out/)
  })

  it('marks internal notes so replies never quote them', () => {
    const r = buildAiRequest({
      feature: 'ticket_reply',
      accountName: 'Bright Smile',
      subject: 'Reminders',
      messages: [msg('Can reminders go out at 9am?'), msg('Check the template quota first', 'Alfred', true)],
      companyName: 'Red Reach Middle East FZE',
      signOff: 'Kind regards,\nAlfred, Red Reach',
    })
    expect(r.user).toContain('INTERNAL NOTE from Alfred')
    expect(r.system).toMatch(/never quote them/)
    expect(r.system).toContain('Kind regards,\nAlfred, Red Reach')
    expect(r.schema).toBeNull()
  })

  it('asks for structured requirements from call notes', () => {
    const r = buildAiRequest({ feature: 'call_notes', accountName: 'Bright Smile', notes: 'They want reminders', existing: ['Booking form'] })
    expect(r.schema).not.toBeNull()
    expect(r.user).toContain('- Booking form')
    expect(r.user).toContain('They want reminders')
  })

  it('reads requirements and drops junk and duplicates', () => {
    expect(
      parseRequirements(
        JSON.stringify({
          requirements: [
            { title: ' Send reminders ', detail: 'Day before' },
            { title: 'send reminders', detail: 'again' },
            { title: '', detail: 'no title' },
            { title: 'Arabic replies' },
          ],
        }),
      ),
    ).toEqual([
      { title: 'Send reminders', detail: 'Day before' },
      { title: 'Arabic replies', detail: '' },
    ])
    expect(parseRequirements('not json')).toEqual([])
    expect(parseRequirements('{"requirements": "x"}')).toEqual([])
  })

  it('checks what the app sends', () => {
    expect(normaliseAiInput({ feature: 'delete_everything' })).toBeNull()
    expect(normaliseAiInput({ feature: 'call_notes', notes: '   ' })).toBeNull()
    expect(normaliseAiInput({ feature: 'ticket_summary', messages: [{ body: '' }] })).toBeNull()
    const n = normaliseAiInput({
      feature: 'ticket_summary',
      accountName: 'A',
      subject: 7,
      messages: [{ who: 'Sara', when: 'today', body: 'y'.repeat(AI_MAX_INPUT_CHARS + 50), internal: 'yes' }],
    })
    expect(n?.feature).toBe('ticket_summary')
    if (n?.feature !== 'ticket_summary') return
    expect(n.subject).toBe('')
    expect(n.messages[0].body.length).toBe(AI_MAX_INPUT_CHARS)
    expect(n.messages[0].internal).toBe(false)
    const facts = normaliseAiInput({ feature: 'report_summary', facts: ['12 hours', 5, ''] })
    expect(facts).toEqual({ feature: 'report_summary', accountName: '', monthLabel: '', facts: ['12 hours'] })
  })

  it('swaps dashes for commas', () => {
    expect(tidyAiText('We fixed it — all good.')).toBe('We fixed it, all good.')
    expect(tidyAiText('Mon–Fri')).toBe('Mon, Fri')
  })

  it('adds up AI spend per account and month', () => {
    const rows = [
      { account_id: 'a', cost_usd: '0.0015', created_at: '2026-11-03T10:00:00Z' },
      { account_id: 'a', cost_usd: 0.002, created_at: '2026-11-20T10:00:00Z' },
      { account_id: 'a', cost_usd: 0.5, created_at: '2026-10-31T10:00:00Z' },
      { account_id: 'b', cost_usd: 1, created_at: '2026-11-03T10:00:00Z' },
    ]
    expect(assistCostInMonth(rows, 'a', '2026-11-01')).toBeCloseTo(0.0035, 6)
  })

  it('turns the report numbers into facts', () => {
    const facts = reportFacts({
      hours: 12.5,
      targetHours: 14,
      hoursByWork: [{ label: 'Support', hours: 4 }],
      ticketsResolved: 3,
      ticketsOpened: 2,
      answered: 3,
      answeredOnTime: 3,
      whatsappUsed: 2400,
      whatsappIncluded: 2000,
      aboveAed: 180,
      buildDone: 6,
      buildTotal: 6,
      buildCurrent: 'Live',
      comingNext: ['Arabic templates'],
    })
    expect(facts).toContain('Usage above the plan: AED 180 excluding VAT')
    expect(facts.join(' ')).toContain('12.5 hours worked against a monthly target of 14 hours (support 4h)')
    expect(facts).toContain('The system is live')
    expect(facts.some((f) => /[—–]/.test(f))).toBe(false)
  })

  it('signs off with a first name and a short company name', () => {
    expect(signOffFor('Alfred Smith', 'Red Reach Middle East FZE')).toBe('Kind regards,\nAlfred, Red Reach')
    expect(signOffFor('', '')).toBe('Kind regards,\nRed Reach')
  })
})
