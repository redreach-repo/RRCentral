import { describe, expect, it } from 'vitest'
import { companyKey, confirmOk, defaultPicks, moveLines, suggestMergeGroups, trnKey, unlinkedCount, type MergePreview } from './clientMerge'

describe('companyKey', () => {
  it('treats the Sharjah Ready Mix spellings as one name', () => {
    const k = companyKey('Sharjah Readymix')
    expect(companyKey('SHARJAH READYMIX L.L.C')).toBe(k)
    expect(companyKey('Sharjah Ready Mix Co.')).toBe(k)
    expect(companyKey('Sharjah Ready-Mix Concrete Company L.L.C SP')).toBe('sharjah readymix concrete')
  })
  it('keeps different companies apart', () => {
    expect(companyKey('Green Cement FZE')).toBe('green cement')
    expect(companyKey('Green Cement')).not.toBe(companyKey('Sharjah Readymix'))
  })
})

describe('trnKey', () => {
  it('reads digits only and ignores short values', () => {
    expect(trnKey('100-2345-6780-0003')).toBe('100234567800003')
    expect(trnKey('12')).toBe('')
  })
})

describe('suggestMergeGroups', () => {
  const list = [
    { id: 'a', company_name: 'Sharjah Ready Mix Concrete Company L.L.C SP', trn: '', email: '', created_at: '2026-01-01' },
    { id: 'b', company_name: 'SHARJAH READYMIX L.L.C', trn: '100234567800003', email: '', created_at: '2026-02-01' },
    { id: 'c', company_name: 'Sharjah Readymix Co.', trn: '', email: '', created_at: '2026-03-01' },
    { id: 'd', company_name: 'Green Cement', trn: '', email: '', created_at: '2026-01-05' },
    { id: 'e', company_name: 'GC Holdings', trn: '100 2345 6780 0003', email: '', created_at: '2026-04-01' },
    { id: 'f', company_name: 'Al Futtaim', trn: '', email: '', created_at: '2026-01-05' },
  ]
  it('joins the three Sharjah records (and a record with the same TRN) into one group, oldest first', () => {
    const g = suggestMergeGroups(list)
    expect(g).toHaveLength(1)
    expect(g[0].ids).toEqual(['a', 'b', 'c', 'e'])
    expect(g[0].reasons).toEqual(expect.arrayContaining(['Same name', 'Name starts the same', 'Same TRN']))
  })
  it('returns nothing when every client is different', () => {
    expect(suggestMergeGroups([list[3], list[5]])).toEqual([])
  })
  it('does not join on a one word prefix', () => {
    expect(suggestMergeGroups([
      { id: 'x', company_name: 'Emirates', trn: '', email: '' },
      { id: 'y', company_name: 'Emirates Steel', trn: '', email: '' },
    ])).toEqual([])
  })
})

describe('preview helpers', () => {
  const p: MergePreview = {
    survivor_id: 'b',
    duplicate_ids: ['a', 'c'],
    records: [],
    moves: { quotations: 1, client_purchase_orders: 1, invoices: 0 },
    unlinked: { quotations: [{ id: 'q7', label: 'RR-01-26007', typed: 'Sharjah ReadyMix LLC' }] },
    fields: [
      { field: 'company_name', values: [{ client_id: 'b', value: 'SHARJAH READYMIX L.L.C' }, { client_id: 'a', value: 'Sharjah Ready Mix' }] },
      { field: 'address', values: [{ client_id: 'a', value: 'Industrial Area 6' }, { client_id: 'c', value: 'PO Box 1' }] },
    ],
    contacts: [],
  }
  it('lists what moves and how many unlinked documents can join', () => {
    expect(moveLines(p.moves)).toEqual(['Quotes: 1', 'Client POs: 1'])
    expect(unlinkedCount(p.unlinked)).toBe(1)
  })
  it('picks the kept value by default, else the first one', () => {
    expect(defaultPicks(p)).toEqual({ company_name: 'b', address: 'a' })
  })
  it('needs MERGE typed to confirm', () => {
    expect(confirmOk(' merge ')).toBe(true)
    expect(confirmOk('yes')).toBe(false)
  })
})
