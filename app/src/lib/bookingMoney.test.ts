import { describe, expect, it } from 'vitest'
import { buildBookingMoneySnapshot } from './bookingMoney'
import type { CustomerPayment, CustomerRefund, Quotation, SupplierCommitment } from './types'

function quote(partial: Partial<Quotation> = {}): Pick<
  Quotation,
  | 'amount'
  | 'currency'
  | 'quotation_currency'
  | 'fx_rate'
  | 'base_amount'
  | 'supplier_cost_base'
  | 'estimated_gross_profit_base'
> {
  return {
    amount: 1000,
    currency: 'USD',
    quotation_currency: 'USD',
    fx_rate: 3.67,
    base_amount: 3670,
    supplier_cost_base: 2000,
    estimated_gross_profit_base: 1670,
    ...partial,
  }
}

function payment(partial: Partial<CustomerPayment> = {}): CustomerPayment {
  return {
    id: 'p1',
    booking_id: 'b1',
    quote_ref: 'Q1',
    invoice_ref: '',
    client: 'Acme',
    payment_date: '2026-07-01',
    amount_received: 500,
    currency: 'USD',
    fx_rate: 3.67,
    fx_rate_date: '2026-07-01',
    fx_rate_approved_by: 'tester',
    base_amount: 1835,
    payment_method: 'Bank Transfer',
    bank_provider: 'Mashreq',
    processing_fee: 0,
    conversion_fee: 0,
    net_amount: 500,
    payment_type: 'Deposit',
    transaction_ref: 'TX1',
    proof_url: '',
    status: 'Received',
    notes: '',
    created_by: 'tester',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('buildBookingMoneySnapshot', () => {
  it('keeps paid totals per currency and computes quote balance', () => {
    const snap = buildBookingMoneySnapshot({
      quote: quote(),
      payments: [payment({ amount_received: 400, net_amount: 400, base_amount: 1468 })],
    })
    expect(snap.quotationCurrency).toBe('USD')
    expect(snap.invoicedQuoteCurrency).toBe(1000)
    expect(snap.paidByCurrency.USD).toBe(400)
    expect(snap.customerBalanceQuoteCurrency).toBe(600)
    expect(snap.receivedBase).toBe(1468)
  })

  it('does not cross-add EUR and USD payments', () => {
    const snap = buildBookingMoneySnapshot({
      quote: quote(),
      payments: [
        payment({ id: '1', currency: 'USD', amount_received: 100, net_amount: 100, base_amount: 367 }),
        payment({
          id: '2',
          currency: 'EUR',
          amount_received: 200,
          net_amount: 200,
          fx_rate: 4,
          base_amount: 800,
        }),
      ],
    })
    expect(snap.paidByCurrency).toEqual({ USD: 100, EUR: 200 })
    expect(snap.receivedBase).toBe(1167)
  })

  it('subtracts refunds and tracks supplier commitments separately', () => {
    const refunds: CustomerRefund[] = [
      {
        id: 'r1',
        payment_id: 'p1',
        booking_id: 'b1',
        quote_ref: 'Q1',
        client: 'Acme',
        refund_date: '2026-07-10',
        original_currency: 'USD',
        original_amount_received: 500,
        refund_currency: 'USD',
        amount_refunded: 100,
        fx_rate: 3.67,
        fx_rate_date: '2026-07-10',
        conversion_fee: 0,
        bank_fee: 0,
        base_amount: 367,
        fx_gain_loss: 0,
        reason: 'Partial cancel',
        approved_by: 'tester',
        approved_at: null,
        status: 'Refunded',
        notes: '',
        created_by: 'tester',
        created_at: '',
      },
    ]
    const suppliers: SupplierCommitment[] = [
      {
        id: 's1',
        booking_id: 'b1',
        quote_ref: 'Q1',
        supplier_name: 'Hotel',
        description: 'Rooms',
        amount: 800,
        currency: 'EUR',
        fx_rate: 4,
        fx_rate_date: '2026-07-01',
        base_amount: 3200,
        status: 'Open',
        due_date: null,
        notes: '',
        created_at: '',
      },
    ]
    const snap = buildBookingMoneySnapshot({
      quote: quote({ supplier_cost_base: 0 }),
      payments: [payment()],
      refunds,
      suppliers,
    })
    expect(snap.paidByCurrency.USD).toBe(400)
    expect(snap.supplierByCurrency.EUR).toBe(800)
    expect(snap.supplierBase).toBe(3200)
    expect(snap.receivedBase).toBe(1468)
  })
})
