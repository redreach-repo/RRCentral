import { describe, expect, it } from 'vitest'
import {
  canQueueRecipient,
  normalizeConsentSource,
  recipientStatusForQueue,
  segmentMatchesContact,
} from './marketingConsent'

describe('marketingConsent', () => {
  it('normalizes consent source', () => {
    expect(normalizeConsentSource('  Web Form ')).toBe('web_form')
  })

  it('blocks queue without opt-in or email', () => {
    expect(canQueueRecipient({ marketing_opt_in: false, email: 'a@b.co' }).ok).toBe(false)
    expect(canQueueRecipient({ marketing_opt_in: true, email: '' }).reason).toBe('no_email')
    expect(canQueueRecipient({ marketing_opt_in: true, email: 'a@b.co' }).ok).toBe(true)
  })

  it('filters segment contacts', () => {
    expect(segmentMatchesContact({ opt_in_only: true }, { marketing_opt_in: false })).toBe(false)
    expect(segmentMatchesContact({ opt_in_only: true }, { marketing_opt_in: true, email: 'x@y.z' })).toBe(true)
    expect(recipientStatusForQueue(false, 'no_consent')).toBe('skipped')
  })
})
