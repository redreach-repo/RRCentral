import { describe, expect, it } from 'vitest'
import { cleanCode, isCodeShaped, twoStepState } from './twoStep'

describe('twoStepState', () => {
  it('asks admins and managers to set up, then for a code, then lets them in', () => {
    for (const role of ['admin', 'manager'] as const) {
      expect(twoStepState(role, { currentLevel: 'aal1', nextLevel: 'aal1' }, true)).toBe('set_up')
      expect(twoStepState(role, { currentLevel: 'aal1', nextLevel: 'aal2' }, true)).toBe('enter_code')
      expect(twoStepState(role, { currentLevel: 'aal2', nextLevel: 'aal2' }, true)).toBe('done')
    }
  })

  it('leaves other roles and local mode alone', () => {
    for (const role of ['sales', 'staff', 'viewer'] as const) {
      expect(twoStepState(role, { currentLevel: 'aal1', nextLevel: 'aal1' }, true)).toBe('not_needed')
    }
    expect(twoStepState('admin', { currentLevel: null, nextLevel: null }, false)).toBe('not_needed')
  })

  it('asks for set up when the level cannot be read', () => {
    expect(twoStepState('admin', { currentLevel: null, nextLevel: null }, true)).toBe('set_up')
  })
})

describe('codes', () => {
  it('accepts 6 digits with spaces', () => {
    expect(cleanCode(' 123 456 ')).toBe('123456')
    expect(isCodeShaped('123 456')).toBe(true)
    expect(isCodeShaped('12345')).toBe(false)
    expect(isCodeShaped('12a456')).toBe(false)
  })
})
