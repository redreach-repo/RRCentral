import { describe, expect, it } from 'vitest'
import { wrapIndex } from '../lib/wrapIndex'

describe('lightbox paging', () => {
  it('wraps forwards and backwards', () => {
    expect(wrapIndex(3, 3)).toBe(0)
    expect(wrapIndex(-1, 3)).toBe(2)
    expect(wrapIndex(1, 3)).toBe(1)
    expect(wrapIndex(0, 0)).toBe(0)
  })
})
