import { describe, expect, it } from 'vitest'
import { parseSupabaseConnectForm } from './supabaseConnect'

describe('parseSupabaseConnectForm', () => {
  it('rejects blank fields', () => {
    const r = parseSupabaseConnectForm({ url: '', anonKey: '' })
    expect(r.ok).toBe(false)
  })

  it('rejects dashboard URL', () => {
    const r = parseSupabaseConnectForm({
      url: 'https://supabase.com/dashboard/project/x',
      anonKey: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Project URL/i)
  })

  it('rejects bad anon key', () => {
    const r = parseSupabaseConnectForm({
      url: 'https://abcd.supabase.co',
      anonKey: 'not-a-jwt',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Anon key/i)
  })

  it('accepts API host + jwt key and strips trailing slash', () => {
    const r = parseSupabaseConnectForm({
      url: 'https://abcd.supabase.co/',
      anonKey: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.url).toBe('https://abcd.supabase.co')
  })
})
