import { describe, expect, it } from 'vitest'
import { anonymizeContactPreview, dsrTypeLabel, nextDsrStatus } from './dsr'

describe('dsr', () => {
  it('labels and transitions', () => {
    expect(dsrTypeLabel('erasure')).toBe('Erasure')
    expect(nextDsrStatus('received', 'start')).toBe('in_progress')
    expect(nextDsrStatus('completed', 'reject')).toBeNull()
    expect(anonymizeContactPreview({ name: 'Pat', email: 'a@b.co', phone: '1' }).name).toBe('Redacted')
  })
})
