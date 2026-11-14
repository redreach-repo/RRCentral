import { describe, expect, it } from 'vitest'
import { parseCrmOutcomeForm } from './crmOutcome'

describe('parseCrmOutcomeForm', () => {
  it('rejects blank reason', () => {
    const r = parseCrmOutcomeForm({ stage: 'Won', outcome_reason: '  ', lost_note: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/reason/i)
  })

  it('requires lost note and list reason when Lost', () => {
    const blank = parseCrmOutcomeForm({ stage: 'Lost', outcome_reason: 'Price', lost_note: '' })
    expect(blank.ok).toBe(false)

    const bad = parseCrmOutcomeForm({ stage: 'Lost', outcome_reason: 'custom text', lost_note: 'x' })
    expect(bad.ok).toBe(false)
  })

  it('accepts Won with a free-text reason', () => {
    const r = parseCrmOutcomeForm({ stage: 'Won', outcome_reason: '  Signed  ', lost_note: '' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.outcome_reason).toBe('Signed')
  })
})
