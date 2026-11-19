import { describe, expect, it } from 'vitest'
import { asError, errorMessage, isMissingRelationError, isUndefinedColumnError, rawErrorMessage, SETUP_NEEDED_PREFIX, setupNeededMessage } from './errors'

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

describe('setup needed message', () => {
  it('turns a missing column into plain words and keeps the detail', () => {
    const msg = errorMessage({ code: '42703', message: 'column crm.deleted_at does not exist' })
    expect(msg.startsWith(SETUP_NEEDED_PREFIX)).toBe(true)
    expect(msg).toContain('Admin, System check')
    expect(msg).toContain('column crm.deleted_at does not exist')
  })

  it('turns a missing table into plain words', () => {
    const msg = errorMessage({ code: 'PGRST205', message: "Could not find the table 'public.client_pos' in the schema cache" })
    expect(msg.startsWith(SETUP_NEEDED_PREFIX)).toBe(true)
  })

  it('leaves other errors alone', () => {
    expect(errorMessage({ code: '23505', message: 'duplicate key value' })).toBe('duplicate key value')
    expect(errorMessage(new Error('Network down'))).toBe('Network down')
  })

  it('does not wrap twice and still detects a wrapped message', () => {
    const once = errorMessage({ code: '42P01', message: 'relation "x" does not exist' })
    expect(setupNeededMessage(once)).toBe(once)
    expect(isMissingRelationError(new Error(once))).toBe(true)
  })

  it('keeps detection working on the raw error', () => {
    const raw = { code: '42703', message: 'column x.y does not exist' }
    expect(isUndefinedColumnError(raw)).toBe(true)
    expect(rawErrorMessage(raw)).toBe('column x.y does not exist')
    expect(asError(raw).message).toBe('column x.y does not exist')
  })
})
