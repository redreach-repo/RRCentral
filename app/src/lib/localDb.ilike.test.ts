import { describe, expect, it } from 'vitest'
import { matchIlike } from './localDb'

describe('matchIlike', () => {
  it('treats % and _ as wildcards, case-insensitively', () => {
    expect(matchIlike('Acme Trading', 'acme%')).toBe(true)
    expect(matchIlike('cat', 'c_t')).toBe(true)
    expect(matchIlike('Acme', 'acm')).toBe(false)
  })

  it('honours backslash escapes like Postgres', () => {
    expect(matchIlike('a_b@x.com', 'a\\_b@x.com')).toBe(true)
    expect(matchIlike('axb@x.com', 'a\\_b@x.com')).toBe(false)
    expect(matchIlike('50%', '50\\%')).toBe(true)
    expect(matchIlike('500', '50\\%')).toBe(false)
  })

  it('does not treat regex characters specially', () => {
    expect(matchIlike('a.c', 'a.c')).toBe(true)
    expect(matchIlike('abc', 'a.c')).toBe(false)
  })
})
