import { describe, expect, it } from 'vitest'
import { canPostJournal, journalBalance, nextJournalNumber, normalizeLine, STARTER_COA } from './ledger'

describe('ledger helpers', () => {
  it('rejects lines with both debit and credit', () => {
    expect(normalizeLine({ accountId: 'a', debit: 10, credit: 5 })).toBeNull()
  })

  it('balances a simple cash sale', () => {
    const bal = journalBalance([
      { accountId: '1100', debit: 1050, credit: 0 },
      { accountId: '4000', debit: 0, credit: 1000 },
      { accountId: '2100', debit: 0, credit: 50 },
    ])
    expect(bal).toEqual({ debitTotal: 1050, creditTotal: 1050, balanced: true, lineCount: 3 })
    expect(canPostJournal({ status: 'draft', lines: [
      { accountId: '1100', debit: 1050, credit: 0 },
      { accountId: '4000', debit: 0, credit: 1000 },
      { accountId: '2100', debit: 0, credit: 50 },
    ] })).toEqual({ ok: true })
  })

  it('refuses unbalanced or posted drafts', () => {
    expect(canPostJournal({ status: 'draft', lines: [{ accountId: 'a', debit: 1, credit: 0 }] }).ok).toBe(false)
    expect(canPostJournal({ status: 'posted', lines: [
      { accountId: 'a', debit: 1, credit: 0 },
      { accountId: 'b', debit: 0, credit: 1 },
    ] })).toEqual({ ok: false, reason: 'Only draft journals can be posted' })
  })

  it('allocates journal numbers', () => {
    expect(nextJournalNumber(['J-2026-0001', 'J-2026-0003'], '2026-11-15')).toBe('J-2026-0004')
  })

  it('ships a starter CoA with ten accounts', () => {
    expect(STARTER_COA).toHaveLength(10)
    expect(STARTER_COA.map((a) => a.code)).toContain('2100')
  })
})
