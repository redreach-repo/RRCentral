import { describe, expect, it } from 'vitest'
import {
  canMakePayLink,
  fromMinorUnits,
  invoiceCurrency,
  outstanding,
  payLinkParams,
  payLinkProblem,
  paymentFromSession,
  toMinorUnits,
  type PayLinkInvoice,
} from './invoicePayLink'

const inv = (over: Partial<PayLinkInvoice> = {}): PayLinkInvoice => ({
  id: 'i1',
  reference_number: 'RR-03-26020',
  client: 'Clinic LLC',
  amount: 5250,
  status: 'Sent',
  payment_status: 'Pending',
  currency: 'AED',
  ...over,
})

describe('payLinkProblem', () => {
  it('only finalised, unpaid invoices with something owed', () => {
    expect(payLinkProblem(inv(), 0)).toBeNull()
    expect(payLinkProblem(inv({ status: 'Draft' }), 0)).toMatch(/Finalise/)
    expect(payLinkProblem(inv({ reference_number: '' }), 0)).toMatch(/Finalise/)
    expect(payLinkProblem(inv({ status: 'Cancelled' }), 0)).toMatch(/Cancelled/)
    expect(payLinkProblem(inv({ payment_status: 'Paid' }), 0)).toMatch(/already paid/)
    expect(payLinkProblem(inv(), 5250)).toMatch(/Nothing is owed/)
    expect(payLinkProblem(inv(), 5249)).toMatch(/too small/)
  })
})

describe('amounts', () => {
  it('asks for what is still owed, in minor units', () => {
    expect(outstanding(5250, 1000.5)).toBe(4249.5)
    expect(toMinorUnits(4249.5, 'AED')).toBe(424950)
    expect(toMinorUnits(1000, 'JPY')).toBe(1000)
    expect(fromMinorUnits(424950, 'aed')).toBe(4249.5)
    expect(invoiceCurrency({ currency: 'usd' })).toBe('USD')
    expect(invoiceCurrency({ currency: null })).toBe('AED')
  })

  it('makes a one time link in the invoice currency', () => {
    const p = payLinkParams(inv({ currency: 'USD' }), 1200, 'Red Reach')
    expect(p.price).toMatchObject({ currency: 'usd', unit_amount: 120000 })
    expect(p.link.restrictions.completed_sessions.limit).toBe(1)
    expect(p.link.metadata).toEqual({ invoice_id: 'i1', invoice_ref: 'RR-03-26020', source: 'rr-central' })
  })
})

describe('paymentFromSession', () => {
  const session = { id: 'cs_1', payment_status: 'paid', amount_total: 525000, currency: 'aed', metadata: { invoice_id: 'i1', source: 'rr-central' } }

  it('pays the invoice in its currency', () => {
    expect(paymentFromSession(session, inv(), 0)).toEqual({ amount: 5250, currency: 'AED', balanceAfter: 0, paymentStatus: 'Paid' })
  })

  it('is a part payment when something is still owed', () => {
    expect(paymentFromSession({ ...session, amount_total: 200000 }, inv(), 1000)).toMatchObject({ amount: 2000, balanceAfter: 2250, paymentStatus: 'Partial' })
  })

  it('ignores unpaid sessions and other invoices', () => {
    expect(paymentFromSession({ ...session, payment_status: 'unpaid' }, inv(), 0)).toBeNull()
    expect(paymentFromSession({ ...session, metadata: { invoice_id: 'other' } }, inv(), 0)).toBeNull()
    expect(paymentFromSession({ ...session, metadata: null }, inv(), 0)).toBeNull()
  })
})

describe('who makes payment links', () => {
  it.each([
    ['admin', true],
    ['manager', true],
    ['sales', true],
    ['staff', false],
    ['viewer', false],
  ])('%s: %s', (role, ok) => {
    expect(canMakePayLink(role)).toBe(ok)
  })
})
