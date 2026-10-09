import { describe, expect, it } from 'vitest'
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  displayDocumentReference,
  isInternalDraftId,
  isQuotePastValidity,
  planA4ImagePlacement,
  planFitPageCount,
  quoteValidUntil,
  splitCanvasVertically,
} from './documents'
import { applyMessageTemplate } from './templates'

describe('documents', () => {
  it('plans near-A4 captures as a single A4 page (not US Letter)', () => {
    // Exact A4 pixel ratio
    const plan = planA4ImagePlacement(794, 1123)
    expect(plan.pageWidth).toBe(A4_WIDTH_MM)
    expect(plan.pageHeight).toBe(A4_HEIGHT_MM)
    expect(plan.pageWidth).not.toBe(215.9) // US Letter width
    expect(plan.placements).toHaveLength(1)
  })

  it('fits slight overshoot onto one A4 page', () => {
    const plan = planA4ImagePlacement(800, 1200) // taller than A4 ratio but within 8%
    expect(plan.placements).toHaveLength(1)
  })

  it('paginates clearly taller captures on A4', () => {
    const plan = planA4ImagePlacement(800, 2000)
    expect(plan.pageHeight).toBe(A4_HEIGHT_MM)
    expect(plan.placements.length).toBeGreaterThan(1)
  })

  it('fit mode prefers one page, else uniform two', () => {
    expect(planFitPageCount(A4_HEIGHT_MM)).toBe(1)
    expect(planFitPageCount(A4_HEIGHT_MM * 1.01)).toBe(1)
    expect(planFitPageCount(A4_HEIGHT_MM * 1.2)).toBe(2)
  })

  it('splitCanvasVertically no-ops for a single part', () => {
    // jsdom may not provide canvas; exercise the parts<=1 guard without DOM.
    const fake = { width: 100, height: 400 } as HTMLCanvasElement
    expect(splitCanvasVertically(fake, 1)).toEqual([fake])
  })

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
        referenceNumber: 'DN-01-26001',
        status: 'Issued',
      }),
    ).toBe('DN-01-26001')
    expect(
      displayDocumentReference({
        referenceNumber: 'DN-DRAFT-1',
        status: 'Draft',
      }),
    ).toBe('DRAFT')
    expect(
      displayDocumentReference({
        referenceNumber: 'INV-DRAFT-1791536651592',
        status: 'Sent',
      }),
    ).toBe('DRAFT')
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
