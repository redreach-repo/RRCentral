import { stageForQuoteStatus, shouldAdvanceStage } from './crmSync'
import { describe, expect, it } from 'vitest'

describe('stageForQuoteStatus', () => {
  it('maps finalized/sent to Quoted', () => {
    expect(stageForQuoteStatus('Finalized')).toBe('Quoted')
    expect(stageForQuoteStatus('Sent')).toBe('Quoted')
  })

  it('maps awarded/lost outcomes', () => {
    expect(stageForQuoteStatus('Awarded')).toBe('Won')
    expect(stageForQuoteStatus('Not awarded')).toBe('Lost')
    expect(stageForQuoteStatus('Expired')).toBe('Lost')
  })

  it('returns null for drafts', () => {
    expect(stageForQuoteStatus('Draft')).toBeNull()
  })
})

describe('shouldAdvanceStage', () => {
  it('advances Lead/Contacted to Quoted', () => {
    expect(shouldAdvanceStage('Lead', 'Quoted')).toBe(true)
    expect(shouldAdvanceStage('Contacted', 'Quoted')).toBe(true)
  })

  it('does not downgrade Negotiation to Quoted', () => {
    expect(shouldAdvanceStage('Negotiation', 'Quoted')).toBe(false)
  })

  it('always allows Won/Lost', () => {
    expect(shouldAdvanceStage('Quoted', 'Won')).toBe(true)
    expect(shouldAdvanceStage('Negotiation', 'Lost')).toBe(true)
    expect(shouldAdvanceStage('Won', 'Lost')).toBe(true)
  })
})
