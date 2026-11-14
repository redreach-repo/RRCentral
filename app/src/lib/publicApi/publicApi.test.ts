import { describe, expect, it } from 'vitest'
import { keyState, parseEventList, publicApiBase, webhookUrlProblem, type ApiKeyRow } from './publicApi'

const key = (over: Partial<ApiKeyRow> = {}): ApiKeyRow => ({
  id: '1', name: 'k', key_prefix: 'hm_abcdefgh', scopes: [], created_by: '', created_at: '', expires_at: null,
  last_used_at: null, revoked_at: null, ...over,
})

describe('public API helpers', () => {
  it('key state', () => {
    expect(keyState(key())).toBe('active')
    expect(keyState(key({ revoked_at: '2026-01-01' }))).toBe('revoked')
    expect(keyState(key({ expires_at: '2026-01-01T00:00:00Z' }), new Date('2026-02-01'))).toBe('expired')
  })
  it('webhook url rules', () => {
    expect(webhookUrlProblem('https://hooks.example.com/x')).toBeNull()
    expect(webhookUrlProblem('http://hooks.example.com')).toMatch(/https/)
    expect(webhookUrlProblem('https://127.0.0.1/x')).toMatch(/Internal/)
    expect(webhookUrlProblem('nope')).toMatch(/full/)
  })
  it('event list parsing', () => {
    expect(parseEventList('')).toEqual(['*'])
    expect(parseEventList('mark_paid, create_crm mark_paid')).toEqual(['mark_paid', 'create_crm'])
  })
  it('base url', () => {
    expect(publicApiBase('https://abc.supabase.co/')).toBe('https://abc.supabase.co/functions/v1/hm-public-api/v1')
  })
})
