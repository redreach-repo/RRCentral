import { describe, expect, it } from 'vitest'
import {
  activityBodyFromWebhook,
  mapMatchesKey,
  matchKeyCandidates,
  normalizeFirefliesWebhook,
} from './firefliesWebhook'

describe('firefliesWebhook', () => {
  it('normalizes payload aliases', () => {
    const p = normalizeFirefliesWebhook({
      meeting_id: '01ABC',
      meeting_title: 'Clinic sync',
      organizer_email: 'A@B.CO',
      overview: 'Discussed Q3',
    })
    expect(p?.meetingId).toBe('01ABC')
    expect(p?.organizerEmail).toBe('a@b.co')
    expect(matchKeyCandidates(p!)).toContain('a@b.co')
    expect(mapMatchesKey('clinic', matchKeyCandidates(p!))).toBe(true)
    expect(activityBodyFromWebhook(p!)).toContain('Discussed Q3')
  })

  it('rejects empty meeting id', () => {
    expect(normalizeFirefliesWebhook({ title: 'x' })).toBeNull()
  })
})
