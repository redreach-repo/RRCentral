import { describe, expect, it } from 'vitest'
import {
  canEditAccount,
  documentsForAccount,
  nextAccountReference,
  normalizeCompanyName,
  sortContacts,
  sortTimeline,
  visibleAccounts,
} from './accounts'
import type { AccountActivity, AccountContact } from './types'

const may2026 = new Date('2026-05-01T00:00:00Z')

describe('account references', () => {
  it('uses the AC prefix and the vertical code for the type', () => {
    expect(nextAccountReference('ai_crm_client', [], may2026)).toBe('AC-07-26001')
    expect(nextAccountReference('worship_church', [], may2026)).toBe('AC-08-26001')
    expect(nextAccountReference('ctrm_prospect', [], may2026)).toBe('AC-09-26001')
  })

  it('continues the sequence per type and ignores invoice numbers', () => {
    const refs = ['AC-07-26001', 'AC-07-26002', 'AC-08-26001', 'RR-07-26009']
    expect(nextAccountReference('ai_crm_client', refs, may2026)).toBe('AC-07-26003')
    expect(nextAccountReference('worship_church', refs, may2026)).toBe('AC-08-26002')
  })
})

describe('account visibility', () => {
  const accounts = [
    { id: 'a', owner_user_id: 'va' },
    { id: 'b', owner_user_id: 'alfred' },
    { id: 'c', owner_user_id: null },
  ]

  it('shows staff only the accounts assigned to them', () => {
    expect(visibleAccounts(accounts, 'staff', 'va').map((a) => a.id)).toEqual(['a'])
    expect(visibleAccounts(accounts, 'staff', null)).toEqual([])
  })

  it('shows every other role everything', () => {
    expect(visibleAccounts(accounts, 'sales', 'x')).toHaveLength(3)
    expect(visibleAccounts(accounts, 'viewer', null)).toHaveLength(3)
  })

  it('lets staff edit only their own account and viewers nothing', () => {
    expect(canEditAccount(accounts[0], 'staff', 'va')).toBe(true)
    expect(canEditAccount(accounts[1], 'staff', 'va')).toBe(false)
    expect(canEditAccount(accounts[1], 'viewer', 'va')).toBe(false)
    expect(canEditAccount(accounts[1], 'sales', 'va')).toBe(true)
  })
})

describe('company name matching', () => {
  it('matches the SQL normaliser', () => {
    expect(normalizeCompanyName('Al Noor Trading L.L.C.')).toBe('al noor')
    expect(normalizeCompanyName('The Coffee Co')).toBe('coffee')
    expect(normalizeCompanyName('ICOC  UAE')).toBe('icoc uae')
  })

  it('splits linked and suggested invoices without touching the client name', () => {
    const docs = [
      { id: '1', client: 'Bright Clinic LLC', account_id: 'acc' },
      { id: '2', client: 'bright clinic', account_id: null },
      { id: '3', client: 'Bright Clinic', account_id: 'other' },
      { id: '4', client: 'Someone Else', account_id: null },
    ]
    const { linked, suggested } = documentsForAccount({ id: 'acc', name: 'Bright Clinic' }, docs)
    expect(linked.map((d) => d.id)).toEqual(['1'])
    expect(suggested.map((d) => d.id)).toEqual(['2'])
  })
})

describe('ordering', () => {
  it('puts the primary contact first', () => {
    const base = { account_id: 'a', role: '', email: '', phone: '', whatsapp: '', created_at: '' }
    const contacts: AccountContact[] = [
      { ...base, id: '1', name: 'Zara', is_primary: false },
      { ...base, id: '2', name: 'Yusuf', is_primary: true },
      { ...base, id: '3', name: 'Adam', is_primary: false },
    ]
    expect(sortContacts(contacts).map((c) => c.name)).toEqual(['Yusuf', 'Adam', 'Zara'])
  })

  it('shows the newest timeline entry first', () => {
    const base = { account_id: 'a', user_id: null, user_email: '', kind: 'note' as const, body: '' }
    const items: AccountActivity[] = [
      { ...base, id: 'old', created_at: '2026-10-01T09:00:00Z' },
      { ...base, id: 'new', created_at: '2026-10-20T09:00:00Z' },
    ]
    expect(sortTimeline(items).map((i) => i.id)).toEqual(['new', 'old'])
  })
})
