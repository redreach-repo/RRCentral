import { describe, expect, it } from 'vitest'
import { canAttachCalls, meetingActivityBody, meetingNotesForAi, parseFirefliesId, readTranscript } from './fireflies'

describe('parseFirefliesId', () => {
  it('reads the ID from a Fireflies link or takes it as it is', () => {
    expect(parseFirefliesId('https://app.fireflies.ai/view/Weekly-call-with-Clinic::01HXYZABCDEF1234')).toBe('01HXYZABCDEF1234')
    expect(parseFirefliesId('https://app.fireflies.ai/view/Call::01HXYZABCDEF1234?ref=share')).toBe('01HXYZABCDEF1234')
    expect(parseFirefliesId('  01HXYZABCDEF1234 ')).toBe('01HXYZABCDEF1234')
    expect(parseFirefliesId('https://app.fireflies.ai/view/01HXYZABCDEF1234')).toBe('01HXYZABCDEF1234')
  })

  it('refuses links that are not Fireflies and junk', () => {
    expect(parseFirefliesId('https://evil.example/view/01HXYZABCDEF1234')).toBeNull()
    expect(parseFirefliesId('not an id!')).toBeNull()
    expect(parseFirefliesId('')).toBeNull()
  })
})

const answer = {
  transcript: {
    id: '01HXYZ',
    title: 'Discovery call',
    date: Date.parse('2026-10-24T09:30:00Z'),
    duration: 42.4,
    transcript_url: 'https://app.fireflies.ai/view/01HXYZ',
    participants: ['sara@clinic.ae', 'alfred@redreach.ae'],
    summary: { overview: 'They want WhatsApp booking.', action_items: '**Alfred**\n- Send the quote\n2. Book a demo\n\n' },
  },
}

describe('readTranscript', () => {
  it('keeps the summary and the action items', () => {
    const m = readTranscript(answer)!
    expect(m).toMatchObject({ id: '01HXYZ', title: 'Discovery call', minutes: 42, date: '2026-10-24T09:30:00.000Z' })
    expect(m.actionItems).toEqual(['Send the quote', 'Book a demo'])
  })

  it('is null when Fireflies did not find it', () => {
    expect(readTranscript({ transcript: null })).toBeNull()
    expect(readTranscript(null)).toBeNull()
  })

  it('makes the timeline entry and the notes for AI help', () => {
    const m = readTranscript(answer)!
    const body = meetingActivityBody(m, '24 Oct 2026, 13:30')
    expect(body).toContain('Fireflies: Discovery call, 24 Oct 2026, 13:30 (42 min)')
    expect(body).toContain('- Send the quote')
    expect(body).toContain('Transcript: https://app.fireflies.ai/view/01HXYZ')
    expect(meetingNotesForAi(m)).toContain('They want WhatsApp booking.')
  })
})

describe('who can attach calls', () => {
  it.each([
    ['admin', true],
    ['manager', true],
    ['sales', true],
    ['staff', true],
    ['viewer', false],
  ])('%s: %s', (role, ok) => {
    expect(canAttachCalls(role)).toBe(ok)
  })
})
