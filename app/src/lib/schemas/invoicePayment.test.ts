import { describe, expect, it } from 'vitest'
import { parseInvoicePaymentForm } from './invoicePayment'

describe('parseInvoicePaymentForm', () => {
  it('rejects zero and blank method', () => {
    expect(parseInvoicePaymentForm({ amount: 0, method: 'Bank', notes: '' }).ok).toBe(false)
    expect(parseInvoicePaymentForm({ amount: 10, method: '  ', notes: '' }).ok).toBe(false)
  })

  it('accepts a positive amount', () => {
    const r = parseInvoicePaymentForm({ amount: '25.5', method: ' Card ', notes: '  deposit  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({ amount: 25.5, method: 'Card', notes: 'deposit' })
  })
})
