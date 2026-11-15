import { describe, expect, it } from 'vitest'
import {
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
