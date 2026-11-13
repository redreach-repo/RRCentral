import { describe, expect, it } from 'vitest'
import {
  contactMatchKey,
  planCrmAccountBackfill,
  resolveCrmAccountLink,
} from './crmAccountLink'
import type { Account } from './types'

function account(partial: Partial<Account> & Pick<Account, 'id' | 'name'>): Account {
  return {
    type: 'ai_crm_client',
    reference: 'AC-07-26001',
    industry: '',
    country: '',
    city: '',
    website: '',
    status: 'prospect',
    owner_user_id: null,
    source: 'crm',
    notes: '',
    created_by: 'test',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('resolveCrmAccountLink', () => {
  it('returns none when the name is empty or unmatched', () => {
    expect(resolveCrmAccountLink('', [])).toEqual({ status: 'none' })
    expect(resolveCrmAccountLink('Quiet Sheet Demo Co', [account({ id: '1', name: 'Other Co' })])).toEqual({
      status: 'none',
    })
  })

  it('links when the normalised company name matches exactly one account', () => {
    const row = account({ id: 'a1', name: 'Al Noor Trading L.L.C.' })
    expect(resolveCrmAccountLink('Al Noor Trading LLC', [row])).toEqual({
      status: 'linked',
      account: row,
    })
  })

  it('returns ambiguous when more than one account matches', () => {
    const a = account({ id: '1', name: 'Coffee Co LLC', reference: 'AC-07-26001' })
    const b = account({ id: '2', name: 'The Coffee Co', reference: 'AC-07-26002' })
    const result = resolveCrmAccountLink('Coffee Co', [a, b])
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') expect(result.accounts.map((x) => x.id).sort()).toEqual(['1', '2'])
  })

  it('ignores legal suffixes the same way rr_normalize_company_name does', () => {
    const row = account({ id: 'x', name: 'Unify Demo Trading LLC' })
    expect(resolveCrmAccountLink('Unify Demo Trading L.L.C.', [row]).status).toBe('linked')
  })
})

describe('contactMatchKey', () => {
  it('prefers email, then phone digits, then name', () => {
    expect(contactMatchKey({ email: 'A@RedReach.ae', phone: '0501234567', name: 'Ali' })).toBe('e:a@redreach.ae')
    expect(contactMatchKey({ email: '', phone: '+971 50 123 4567', name: 'Ali' })).toBe('p:971501234567')
    expect(contactMatchKey({ email: '', phone: '12', name: ' Ali ' })).toBe('n:ali')
    expect(contactMatchKey({ email: '', phone: '', name: '' })).toBe('')
  })
})

describe('planCrmAccountBackfill', () => {
  it('skips already-linked rows and buckets the rest', () => {
    const accounts = [
      account({ id: 'a1', name: 'Unique Co LLC', reference: 'AC-01' }),
      account({ id: 'a2', name: 'Dup Co', reference: 'AC-02' }),
      account({ id: 'a3', name: 'The Dup Co', reference: 'AC-03' }),
    ]
    const plan = planCrmAccountBackfill(
      [
        { id: 'c0', company_name: 'Already', account_id: 'a1' },
        { id: 'c1', company_name: 'Unique Co', account_id: null },
        { id: 'c2', company_name: 'Dup Co', account_id: null },
        { id: 'c3', company_name: 'Brand New', account_id: null },
      ],
      accounts,
    )
    expect(plan.unique).toEqual([
      {
        crmId: 'c1',
        companyName: 'Unique Co',
        accountId: 'a1',
        accountName: 'Unique Co LLC',
        accountReference: 'AC-01',
      },
    ])
    expect(plan.ambiguous.map((r) => r.crmId)).toEqual(['c2'])
    expect(plan.none.map((r) => r.crmId)).toEqual(['c3'])
  })
})
