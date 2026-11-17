import { describe, expect, it } from 'vitest'
import {
  CLIENT_PO_DEPARTMENTS,
  clientPoDepartmentLabel,
  clientPoInvoicePool,
  clientPoPartyName,
  clientPoRemaining,
  clientPoStatusAfterMatch,
  clientPoStatusAfterReceipt,
  suggestClientPoInvoiceMatch,
} from './clientPurchaseOrders'

describe('client PO invoice match', () => {
  it('suggests nearest non-draft invoice by amount', () => {
    const match = suggestClientPoInvoiceMatch(
      { amount: 1000 },
      [
        { id: '1', reference_number: 'INV-1', amount: 500, status: 'Sent' },
        { id: '2', reference_number: 'INV-2', amount: 1000, status: 'Sent' },
        { id: '3', reference_number: 'INV-3', amount: 1000, status: 'Draft' },
      ],
    )
    expect(match?.invoiceId).toBe('2')
    expect(match?.reason).toMatch(/Exact/i)
  })

  it('maps status after match', () => {
    expect(clientPoStatusAfterMatch(1000, 1000)).toBe('fulfilled')
    expect(clientPoStatusAfterMatch(1000, 400)).toBe('partial')
    expect(clientPoStatusAfterMatch(1000, 0)).toBe('open')
  })

  it('tracks remaining after receipt', () => {
    expect(clientPoStatusAfterReceipt(1000, 250)).toBe('partial')
    expect(clientPoRemaining(1000, 250)).toBe(750)
  })
})

describe('client POs for every department', () => {
  it('names the client first, then a legacy account', () => {
    expect(clientPoPartyName({ clients: { company_name: 'Threads Buyer' }, accounts: { name: 'ICOC' } })).toBe(
      'Threads Buyer',
    )
    expect(clientPoPartyName({ clients: null, accounts: { name: 'ICOC Dubai' } })).toBe('ICOC Dubai')
    expect(clientPoPartyName({ client_id: 'c1' })).toBe('c1')
    expect(clientPoPartyName({})).toBe('Unknown client')
  })

  it('matches invoices by client name for non CRM departments', () => {
    const invoices = [
      { id: '1', client: 'Mass Allied Freighters L.L.C', account_id: null },
      { id: '2', client: 'ICOC Dubai', account_id: 'a1' },
    ]
    const pool = clientPoInvoicePool({ account_id: null, partyName: ' mass allied freighters l.l.c ' }, invoices)
    expect(pool.map((i) => i.id)).toEqual(['1'])
  })

  it('matches by account for older rows and falls back to all invoices', () => {
    const invoices = [
      { id: '1', client: 'Other', account_id: null },
      { id: '2', client: 'ICOC Dubai', account_id: 'a1' },
    ]
    expect(clientPoInvoicePool({ account_id: 'a1', partyName: 'x' }, invoices).map((i) => i.id)).toEqual(['2'])
    expect(clientPoInvoicePool({ account_id: null, partyName: 'Nobody' }, invoices)).toHaveLength(2)
  })
})

describe('client PO departments', () => {
  it('lists every department, not only AI CRM', () => {
    expect(CLIENT_PO_DEPARTMENTS.map((d) => d.code)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09'])
    expect(clientPoDepartmentLabel('01')).toBe('01 RR Threads')
    expect(clientPoDepartmentLabel('07')).toBe('07 AI CRM')
    expect(clientPoDepartmentLabel(null)).toBe('')
  })
})
