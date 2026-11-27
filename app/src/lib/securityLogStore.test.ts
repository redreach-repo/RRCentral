import { describe, expect, it } from 'vitest'
import { browserLabel, offboardSummary } from './securityLogStore'

describe('browserLabel', () => {
  it('names common browsers and systems', () => {
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/131.0 Safari/537.36')).toBe('Chrome on Windows')
    expect(browserLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1')).toBe('Safari on iPhone/iPad')
    expect(browserLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/131 Edg/131')).toBe('Edge on Mac')
    expect(browserLabel('')).toBe('Unknown browser')
  })
})

describe('offboardSummary', () => {
  it('says what the leaver button did, leaving out zero counts', () => {
    expect(
      offboardSummary({ accounts: 3, leads: 5, switches: 0, projects: 1, ai_keys: 0, sessions: 2, handed_to: 'Maya' }),
    ).toBe('Switched off. 3 account(s) and 5 lead(s) handed to Maya, removed from 1 project(s), signed out everywhere.')
  })
})
