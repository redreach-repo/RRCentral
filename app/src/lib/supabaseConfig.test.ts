import { describe, expect, it } from 'vitest'
import { isUnsafeBrowserSupabaseKey, supabaseJwtRole, supabaseRequestHeaders } from './supabaseConfig'

function fakeJwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ role, ref: 'test' })).toString('base64url')
  return `${header}.${payload}.sig`
}

describe('supabase client key guards', () => {
  it('reads JWT role', () => {
    expect(supabaseJwtRole(fakeJwt('anon'))).toBe('anon')
    expect(supabaseJwtRole(fakeJwt('service_role'))).toBe('service_role')
  })

  it('rejects service_role for the browser', () => {
    expect(isUnsafeBrowserSupabaseKey(fakeJwt('service_role'))).toBe(true)
    expect(isUnsafeBrowserSupabaseKey(fakeJwt('anon'))).toBe(false)
    expect(isUnsafeBrowserSupabaseKey('sb_publishable_not_a_jwt')).toBe(false)
    expect(isUnsafeBrowserSupabaseKey('sb_secret_abcdefghijkl')).toBe(true)
  })

  it('puts a publishable key on apikey only, and a user token on Authorization', () => {
    expect(supabaseRequestHeaders('sb_publishable_x')).toEqual({ apikey: 'sb_publishable_x' })
    expect(supabaseRequestHeaders('sb_publishable_x', 'user.jwt')).toEqual({ apikey: 'sb_publishable_x', Authorization: 'Bearer user.jwt' })
    const anon = fakeJwt('anon')
    expect(supabaseRequestHeaders(anon)).toEqual({ apikey: anon, Authorization: `Bearer ${anon}` })
  })
})

