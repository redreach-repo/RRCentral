import { describe, expect, it } from 'vitest'
import { previewNextReference, type NumberingSequence } from './numbering'

describe('numbering', () => {
  it('previews the next reference from a sequence row', () => {
    const seq: NumberingSequence = {
      id: '1',
      doc_type: 'quotation',
      division_code: '01',
      prefix: 'RR',
      year_yy: '26',
      last_seq: 14,
      pad: 3,
      active: true,
    }
    expect(previewNextReference(seq)).toBe('RR-01-26015')
  })

  it('respects pad width in the preview', () => {
    const seq: NumberingSequence = {
      id: '2',
      doc_type: 'purchase_order',
      division_code: '01',
      prefix: 'PO',
      year_yy: '26',
      last_seq: 7,
      pad: 4,
      active: true,
    }
    expect(previewNextReference(seq)).toBe('PO-01-260008')
  })
})
