import { describe, expect, it } from 'vitest'
import { parseScheduleMeetingForm } from './scheduleMeeting'

const base = {
  title: ' Kickoff ',
  date: '2026-11-20',
  time: '10:30',
  duration: '45',
  location: 'Zoom',
  notes: ' bring deck ',
  attendeeEmails: ['a@redreach.ae'],
}

describe('parseScheduleMeetingForm', () => {
  it('parses a valid meeting', () => {
    const r = parseScheduleMeetingForm(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.title).toBe('Kickoff')
    expect(r.data.startHour).toBe(10)
    expect(r.data.startMinute).toBe(30)
    expect(r.data.durationMinutes).toBe(45)
    expect(r.data.description).toBe('bring deck')
  })

  it('requires a title', () => {
    const r = parseScheduleMeetingForm({ ...base, title: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Title/i)
  })

  it('requires attendees', () => {
    const r = parseScheduleMeetingForm({ ...base, attendeeEmails: [] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/team member/i)
  })

  it('defaults duration when blank', () => {
    const r = parseScheduleMeetingForm({ ...base, duration: '' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.durationMinutes).toBe(30)
  })
})
