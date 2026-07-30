import { describe, expect, it } from 'vitest'
import {
  displayDocumentReference,
  isInternalDraftId,
  isQuotePastValidity,
  quoteValidUntil,
} from './documents'
import { applyMessageTemplate } from './templates'

describe('documents', () => {
  it('detects internal draft ids', () => {
    expect(isInternalDraftId('Q-1785391827656')).toBe(true)
    expect(isInternalDraftId('RR-01-26001')).toBe(false)
    expect(isInternalDraftId('')).toBe(false)
  })

  it('displays DRAFT instead of timestamp ids', () => {
    expect(
      displayDocumentReference({
        referenceNumber: '',
        fallbackId: 'Q-1785391827656',
        status: 'Draft',
      }),
    ).toBe('DRAFT')
    expect(
      displayDocumentReference({
        referenceNumber: 'RR-01-26001',
        fallbackId: 'Q-1',
        status: 'Finalized',
      }),
    ).toBe('RR-01-26001')
  })

  it('computes valid until and past-validity', () => {
    expect(quoteValidUntil('2026-07-01', 14)).toBe('2026-07-15')
    expect(isQuotePastValidity('2020-01-01', new Date('2026-07-30'))).toBe(true)
    expect(isQuotePastValidity('2099-01-01', new Date('2026-07-30'))).toBe(false)
  })
})

describe('templates', () => {
  it('replaces tokens', () => {
    expect(applyMessageTemplate('Hi {{contact}} — {{ref}}', { contact: 'Sam', ref: 'RR-01' })).toBe(
      'Hi Sam — RR-01',
    )
    expect(applyMessageTemplate('{{missing}} ok', {})).toBe(' ok')
  })
})
