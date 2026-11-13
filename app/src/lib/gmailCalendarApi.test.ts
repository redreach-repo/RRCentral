import { describe, expect, it } from 'vitest'
import {
  isGmailCalendarEnabled,
  isGmailConnected,
  isGmailMailEnabled,
} from './gmailCalendarApi'

describe('gmailCalendarApi flags', () => {
  it('treats gmailConnected=yes as configured', () => {
    expect(isGmailConnected({ gmailConnected: 'yes' })).toBe(true)
    expect(isGmailConnected({ gmailConnected: 'no' })).toBe(false)
    expect(isGmailConnected({})).toBe(false)
  })

  it('enables mail/calendar unless explicitly no when connected', () => {
    const connected = { gmailConnected: 'yes' }
    expect(isGmailMailEnabled(connected)).toBe(true)
    expect(isGmailCalendarEnabled(connected)).toBe(true)
    expect(isGmailMailEnabled({ ...connected, gmailMailEnabled: 'no' })).toBe(false)
    expect(isGmailCalendarEnabled({ ...connected, gmailCalendarEnabled: 'no' })).toBe(false)
  })
})
