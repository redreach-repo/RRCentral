import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('reads Supabase/PostgREST errors, which are plain objects rather than Error instances', () => {
    const postgrestError = {
      message: 'new row violates row-level security policy for table "quotations"',
      details: null,
      hint: null,
      code: '42501',
    }
    expect(postgrestError instanceof Error).toBe(false)
    expect(errorMessage(postgrestError, 'Save failed')).toBe(
      'new row violates row-level security policy for table "quotations"',
    )
  })

  it('joins message, details and hint', () => {
    expect(errorMessage({ message: 'Bad input', details: 'qty is null', hint: 'Fill qty' })).toBe(
      'Bad input — qty is null — Fill qty',
    )
  })

  it('falls back when nothing readable is present', () => {
    expect(errorMessage({}, 'Save failed')).toBe('Save failed')
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })
})
