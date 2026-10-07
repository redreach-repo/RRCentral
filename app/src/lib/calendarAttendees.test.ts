import { describe, expect, it } from 'vitest'
import { mergeAttendeeEmails, resolveOwnerEmail, resolveOwnerEmails } from './calendarAttendees'

const team = [
  { email: 'alfred@redreach.ae', name: 'Alfred', active: true },
  { email: 'jacob@redreach.ae', name: 'Jacob', active: true },
  { email: 'former@redreach.ae', name: 'Former', active: false },
]

describe('calendarAttendees', () => {
  it('resolves owner name to email', () => {
    expect(resolveOwnerEmail('Jacob', team)).toBe('jacob@redreach.ae')
    expect(resolveOwnerEmail('jacob@redreach.ae', team)).toBe('jacob@redreach.ae')
  })

  it('skips inactive users', () => {
    expect(resolveOwnerEmail('Former', team)).toBe('')
  })

  it('parses comma-separated owners', () => {
    expect(resolveOwnerEmails('Alfred, Jacob', team)).toEqual([
      'alfred@redreach.ae',
      'jacob@redreach.ae',
    ])
  })

  it('dedupes attendee lists', () => {
    expect(
      mergeAttendeeEmails(['alfred@redreach.ae', 'ALFRED@redreach.ae'], ['jacob@redreach.ae']),
    ).toEqual(['alfred@redreach.ae', 'jacob@redreach.ae'])
  })
})
