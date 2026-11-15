import { describe, expect, it } from 'vitest'
import {
  autoPostSourceId,
  expenseAutoPostSourceId,
  expenseToDraftLines,
  invoiceToDraftLines,
  linesBalance,
} from './autoPost'

describe('invoice auto-post stub', () => {
  it('builds balanced AR / revenue / VAT lines', () => {
    const lines = invoiceToDraftLines({
      invoiceId: 'i1',
      invoiceNumber: 'INV-1',
      entryDate: '2026-11-15',
      exclusiveAed: 100,
      vatAed: 5,
      inclusiveAed: 105,
    })
    expect(linesBalance(lines)).toBe(true)
    expect(lines.find((l) => l.code === '1200')?.debit).toBe(105)
    expect(autoPostSourceId('i1')).toBe('invoice:i1')
  })
})

describe('expense auto-post stub', () => {
  it('builds balanced opex / bank lines', () => {
    const lines = expenseToDraftLines({
      expenseId: 'e1',
      label: 'Rent',
      entryDate: '2026-11-15',
      exclusiveAed: 100,
      vatAed: 5,
      inclusiveAed: 105,
    })
    expect(linesBalance(lines)).toBe(true)
    expect(expenseAutoPostSourceId('e1')).toBe('expense:e1')
  })
})
