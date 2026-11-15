import { describe, expect, it } from 'vitest'
import { engClaimLabel, engDocLabel } from './engFoundation'

describe('engFoundation', () => {
  it('formats labels', () => {
    expect(engDocLabel('DR-1', 'Spec')).toBe('DR-1 · Spec')
    expect(engClaimLabel('CL-1', 'Delay', 1000)).toContain('1000.00')
  })
})
