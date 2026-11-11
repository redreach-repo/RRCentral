import { describe, expect, it } from 'vitest'
import { assertLineItemImageFile, hasLineItemImage } from './lineItemImage'

describe('hasLineItemImage', () => {
  it('treats blank as absent so the quotation omits placeholders', () => {
    expect(hasLineItemImage('')).toBe(false)
    expect(hasLineItemImage('   ')).toBe(false)
    expect(hasLineItemImage(null)).toBe(false)
    expect(hasLineItemImage(undefined)).toBe(false)
  })

  it('treats a data URL as present', () => {
    expect(hasLineItemImage('data:image/jpeg;base64,abc')).toBe(true)
  })
})

describe('assertLineItemImageFile', () => {
  it('accepts common image types', () => {
    expect(() =>
      assertLineItemImageFile(new File([new Uint8Array([1])], 'polo.jpg', { type: 'image/jpeg' })),
    ).not.toThrow()
  })

  it('rejects non-images', () => {
    expect(() =>
      assertLineItemImageFile(new File([new Uint8Array([1])], 'notes.pdf', { type: 'application/pdf' })),
    ).toThrow(/image file/i)
  })
})
