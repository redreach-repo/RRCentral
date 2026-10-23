import { describe, expect, it } from 'vitest'
import { describeError, errorKey, groupErrors, shouldReport, type AppError } from './errorReporting'

function err(partial: Partial<AppError>): AppError {
  return {
    id: 1,
    created_at: '2026-10-23T10:00:00Z',
    kind: 'browser',
    message: 'Save failed',
    detail: '',
    page: '/accounts',
    user_email: 'va@redreach.ae',
    user_agent: '',
    release: '',
    ...partial,
  }
}

describe('error reporting', () => {
  it('ignores browser noise', () => {
    expect(shouldReport('ResizeObserver loop completed with undelivered notifications.')).toBe(false)
    expect(shouldReport('Script error.')).toBe(false)
    expect(shouldReport('')).toBe(false)
    expect(shouldReport('Cannot read properties of undefined')).toBe(true)
  })

  it('treats the same error with different ids and numbers as one', () => {
    expect(errorKey('Row 12 for 9b2f1c3e-1111-2222-3333-444455556666 failed')).toBe(
      errorKey('Row 7 for 0a0a0a0a-1111-2222-3333-444455556666 failed'),
    )
  })

  it('describes errors, Supabase errors and strings', () => {
    expect(describeError(new Error('boom')).message).toBe('boom')
    expect(describeError({ message: 'violates row-level security', code: '42501', hint: 'check role' })).toEqual({
      message: 'violates row-level security',
      detail: '42501\ncheck role',
    })
    expect(describeError('plain').message).toBe('plain')
    expect(describeError(null).message).toBe('null')
  })

  it('groups by message with counts and people, newest first', () => {
    const groups = groupErrors([
      err({ id: 1, message: 'Save failed for row 1', created_at: '2026-10-23T10:00:00Z' }),
      err({ id: 2, message: 'Save failed for row 2', created_at: '2026-10-23T12:00:00Z', user_email: 'alfred@redreach.ae' }),
      err({ id: 3, message: 'Other', created_at: '2026-10-23T11:00:00Z' }),
    ])
    expect(groups.map((g) => g.count)).toEqual([2, 1])
    expect(groups[0].latest.id).toBe(2)
    expect(groups[0].people).toEqual(['alfred@redreach.ae', 'va@redreach.ae'])
  })
})
