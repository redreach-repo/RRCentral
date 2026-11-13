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
})
