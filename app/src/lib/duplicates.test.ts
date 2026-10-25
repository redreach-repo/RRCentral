import { describe, expect, it } from 'vitest'
import {
  accountFills,
  domainKey,
  emailKey,
  findAccountDuplicates,
  findContactDuplicates,
  mergeSummary,
  nameKey,
  nameSimilarity,
  pairKey,
  phoneKey,
  suggestKeep,
} from './duplicates'
import type { Account } from './types'

const acc = (id: string, name: string, over: Partial<Account> = {}) =>
  ({ id, name, type: 'ai_crm_client', website: '', industry: '', country: '', city: '', source: '', created_at: '2026-01-01', ...over }) as Account
const con = (id: string, account_id: string, over: Record<string, string> = {}) => ({ id, account_id, name: '', email: '', phone: '', whatsapp: '', ...over })

describe('keys', () => {
  it('matches local and international phone numbers', () => {
    expect(phoneKey('050 123 4567')).toBe(phoneKey('+971 50 123 4567'))
    expect(phoneKey('00971501234567')).toBe(phoneKey('0501234567'))
    expect(phoneKey('12345')).toBe('')
    expect(phoneKey('')).toBe('')
  })
  it('cleans emails and websites', () => {
    expect(emailKey(' Sam@Acme.AE ')).toBe('sam@acme.ae')
    expect(emailKey('not an email')).toBe('')
    expect(domainKey('https://www.acme.ae/about')).toBe('acme.ae')
    expect(domainKey('acme')).toBe('')
  })
  it('drops company suffixes and punctuation from names', () => {
    expect(nameKey('Acme Trading L.L.C.')).toBe('acme')
    expect(nameKey('Smith & Sons FZE')).toBe('smith and sons')
  })
  it('scores similar names', () => {
    expect(nameSimilarity('Acme LLC', 'ACME')).toBe(1)
    expect(nameSimilarity('Bright Smile Dental', 'Bright Smiles Dental')).toBeGreaterThanOrEqual(0.85)
    expect(nameSimilarity('Bright Smile Dental', 'Desert Rose Church')).toBeLessThan(0.5)
    expect(nameSimilarity('', 'x')).toBe(0)
  })
})

describe('findAccountDuplicates', () => {
  const accounts = [acc('a1', 'Acme LLC'), acc('a2', 'ACME'), acc('a3', 'Other Co', { website: 'www.other.ae' }), acc('a4', 'Different', { website: 'https://other.ae' }), acc('a5', 'Acme', { type: 'ctrm_prospect' })]
  const contacts = [con('c1', 'a3', { phone: '0501112222' }), con('c2', 'a1', { whatsapp: '+971501112222' }), con('c3', 'a2', { email: 'x@y.com' }), con('c4', 'a4', { email: 'X@y.com' })]

  it('finds pairs by phone, email, website and name within a type', () => {
    const pairs = findAccountDuplicates(accounts, contacts)
    const keys = pairs.map((p) => `${p.a}-${p.b}`)
    expect(keys).toContain('a1-a3')
    expect(keys).toContain('a2-a4')
    expect(keys).toContain('a3-a4')
    expect(keys).toContain('a1-a2')
    expect(keys).not.toContain('a1-a5')
    const web = pairs.find((p) => p.a === 'a3' && p.b === 'a4')!
    expect(web.reasons[0]).toMatch(/Same website/)
  })
  it('leaves out dismissed pairs', () => {
    const pairs = findAccountDuplicates(accounts, contacts, new Set([pairKey('account', 'a2', 'a1')]))
    expect(pairs.some((p) => p.a === 'a1' && p.b === 'a2')).toBe(false)
  })
  it('ignores contacts of accounts it was not given', () => {
    expect(findAccountDuplicates([acc('a1', 'One')], [con('c1', 'a1', { phone: '0501112222' }), con('c2', 'zz', { phone: '0501112222' })])).toEqual([])
  })
})

describe('findContactDuplicates', () => {
  it('finds the same phone anywhere and the same name on one account', () => {
    const pairs = findContactDuplicates([
      con('c1', 'a1', { name: 'Sam Lee', phone: '0501112222' }),
      con('c2', 'a2', { name: 'Samuel', phone: '971501112222' }),
      con('c3', 'a1', { name: 'sam lee' }),
      con('c4', 'a2', { name: 'Sam Lee' }),
    ])
    const keys = pairs.map((p) => `${p.a}-${p.b}`)
    expect(keys).toEqual(expect.arrayContaining(['c1-c2', 'c1-c3']))
    expect(keys).not.toContain('c3-c4')
  })
})

describe('merge helpers', () => {
  it('lists blank details the duplicate fills', () => {
    expect(accountFills(acc('a', 'A', { city: 'Dubai' }), acc('b', 'B', { city: 'Abu Dhabi', website: 'b.ae' }))).toEqual([{ field: 'Website', value: 'b.ae' }])
  })
  it('keeps the one with more on it, then the older one', () => {
    const a = { id: 'a', created_at: '2026-02-01' }
    const b = { id: 'b', created_at: '2026-01-01' }
    expect(suggestKeep(a, b, (x) => (x.id === 'a' ? 5 : 1)).id).toBe('a')
    expect(suggestKeep(a, b, () => 0).id).toBe('b')
  })
  it('summarises the merge', () => {
    expect(mergeSummary({ moved: { account_activities: 3 }, left: {}, removed: 'Acme' })).toBe('Merged Acme. Moved 3 account activities.')
    expect(mergeSummary({ moved: {}, left: { 'public.client_usage': 1 }, removed: 'Acme' })).toMatch(/Not moved .*1 client usage/)
  })
})
