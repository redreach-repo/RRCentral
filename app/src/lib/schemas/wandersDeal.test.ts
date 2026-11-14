import { describe, expect, it } from 'vitest'
import { parseWandersDealForm, parseWandersTermsAcceptForm } from './wandersDeal'

describe('parseWandersDealForm', () => {
  it('rejects blank client', () => {
    const r = parseWandersDealForm({ client_name: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/client/i)
  })

  it('trims client name', () => {
    const r = parseWandersDealForm({ client_name: '  Acme Tours  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.client_name).toBe('Acme Tours')
  })
})

describe('parseWandersTermsAcceptForm', () => {
  it('requires terms version and acceptor', () => {
    expect(parseWandersTermsAcceptForm({ terms_version: '', accepted_by: 'Alex' }).ok).toBe(false)
    expect(parseWandersTermsAcceptForm({ terms_version: 'v1', accepted_by: '  ' }).ok).toBe(false)
  })

  it('accepts both fields', () => {
    const r = parseWandersTermsAcceptForm({ terms_version: ' 2024.1 ', accepted_by: ' Alex ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({ terms_version: '2024.1', accepted_by: 'Alex' })
  })
})
