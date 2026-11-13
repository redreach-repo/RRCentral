import { describe, expect, it } from 'vitest'
import {
  parseCustomerPaymentForm,
  parseCustomerRefundForm,
  parseSupplierCommitmentForm,
  type CustomerPaymentFormInput,
} from './payment'

const payBase: CustomerPaymentFormInput = {
  booking_id: 'b1',
  quote_ref: 'RR-02-1',
  invoice_ref: '',
  client: 'Acme',
  payment_date: '2026-11-13',
  amount_received: 500,
  currency: 'USD',
  fx_rate: 3.67,
  fx_rate_date: '2026-11-13',
  payment_method: 'Bank Transfer',
  bank_provider: '',
  processing_fee: 0,
  conversion_fee: 0,
  payment_type: 'Deposit',
  transaction_ref: '',
  proof_url: '',
  status: 'Received',
  notes: '',
}

describe('parseCustomerPaymentForm', () => {
  it('requires amount received', () => {
    const r = parseCustomerPaymentForm({ ...payBase, amount_received: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/amount received/i)
  })

  it('rejects bad FX', () => {
    const r = parseCustomerPaymentForm({ ...payBase, fx_rate: 0 })
    expect(r.ok).toBe(false)
  })

  it('accepts a valid payment', () => {
    const r = parseCustomerPaymentForm(payBase)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.currency).toBe('USD')
  })
})

describe('parseCustomerRefundForm', () => {
  it('requires amount and reason', () => {
    expect(parseCustomerRefundForm({ amount_refunded: 0, reason: 'oops' }).ok).toBe(false)
    expect(parseCustomerRefundForm({ amount_refunded: 10, reason: '  ' }).ok).toBe(false)
  })

  it('accepts a valid refund', () => {
    const r = parseCustomerRefundForm({ amount_refunded: 25, reason: 'Overpaid' })
    expect(r.ok).toBe(true)
  })
})

describe('parseSupplierCommitmentForm', () => {
  it('requires name and amount', () => {
    const r = parseSupplierCommitmentForm({
      supplier_name: '',
      description: '',
      amount: 0,
      currency: 'AED',
      fx_rate: 1,
      fx_rate_date: '2026-11-13',
      due_date: '',
      notes: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Supplier name/i)
  })

  it('accepts a valid commitment', () => {
    const r = parseSupplierCommitmentForm({
      supplier_name: 'Desert Tours',
      description: 'Hotel',
      amount: 1200,
      currency: 'aed',
      fx_rate: 1,
      fx_rate_date: '2026-11-13',
      due_date: '',
      notes: '  ',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.currency).toBe('AED')
  })
})
