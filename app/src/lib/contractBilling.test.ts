import { describe, expect, it } from 'vitest'
import { DEFAULT_DELIVERY_RATES } from './delivery'
import {
  billingStartMonth,
  dueReminder,
  invoiceDueDate,
  monthlyInvoicePlan,
  paymentTermDays,
  reminderMessage,
  setupInvoicePlan,
  withVat,
} from './contractBilling'

const contract = {
  status: 'active' as const,
  term_start: '2026-10-10',
  term_end: '2027-10-09',
  monthly_fee: 4200,
  setup_fee: 3000,
  setup_fee_paid: 0,
  discount_percent: 0,
  discount_months_left: 0,
  annual_prepay: false,
  option: 'B' as const,
  created_at: '2026-10-10T08:00:00Z',
  auto_invoice: true,
  billing_from: null,
}
const pkg = { name: 'Growth', included_whatsapp: 4000, ai_cap_usd: 50, included_lead_credits_usd: 0 }
const noUsage = { whatsapp_marketing_count: 0, whatsapp_service_count: 0, ai_cost_usd: 0, lead_credits_cost_usd: 0 }

describe('setup invoice', () => {
  it('bills the unpaid setup fee once the contract is active', () => {
    const plan = setupInvoicePlan(contract, 'Growth')
    expect(plan?.subtotal).toBe(3000)
    expect(plan?.period).toBe('2026-10-01')
    expect(setupInvoicePlan({ ...contract, setup_fee_paid: 1000 }, 'Growth')?.subtotal).toBe(2000)
  })

  it('skips when off, not active or already paid', () => {
    expect(setupInvoicePlan({ ...contract, auto_invoice: false }, 'Growth')).toBeNull()
    expect(setupInvoicePlan({ ...contract, status: 'draft' }, 'Growth')).toBeNull()
    expect(setupInvoicePlan({ ...contract, setup_fee_paid: 3000 }, 'Growth')).toBeNull()
  })
})

describe('monthly invoice', () => {
  const plan = (over: object, month: string, usage: typeof noUsage | null = null) =>
    monthlyInvoicePlan({ contract: { ...contract, ...over }, pkg, previousUsage: usage, rates: DEFAULT_DELIVERY_RATES, month })

  it('bills the fee for the month', () => {
    const p = plan({}, '2026-11-01')
    expect(p?.lines).toEqual([{ description: 'Monthly fee, Growth package, November 2026', qty: 1, unit_price: 4200 }])
    expect(p?.subtotal).toBe(4200)
  })

  it('adds last month usage over the plan', () => {
    const p = plan({}, '2026-11-01', { whatsapp_marketing_count: 4100, whatsapp_service_count: 200, ai_cost_usd: 60, lead_credits_cost_usd: 0 })
    const byName = Object.fromEntries((p?.lines ?? []).map((l) => [l.description.split(',')[0], l]))
    expect(byName['WhatsApp marketing conversations over the plan']).toMatchObject({ qty: 100, unit_price: 0.3 })
    expect(byName['WhatsApp service conversations over the plan']).toMatchObject({ qty: 200, unit_price: 0.07 })
    // 10 USD over the cap, at 3.6725 plus 25%.
    expect(byName['AI usage over the included amount'].unit_price).toBe(45.91)
    expect(p?.subtotal).toBe(4200 + 30 + 14 + 45.91)
  })

  it('applies a discount month and flags it', () => {
    const p = plan({ discount_percent: 10, discount_months_left: 2 }, '2026-11-01')
    expect(p?.lines[0]).toMatchObject({ unit_price: 3780 })
    expect(p?.lines[0].description).toContain('10% discount')
    expect(p?.usesDiscountMonth).toBe(true)
  })

  it('never bills before the billing start', () => {
    expect(plan({ billing_from: '2026-12-01' }, '2026-11-01')).toBeNull()
    expect(billingStartMonth({ ...contract, billing_from: '2026-12-01' })).toBe('2026-12-01')
    // Starting in December: November usage was billed by hand, so it is left off.
    const dec = plan({ billing_from: '2026-12-01' }, '2026-12-01', { ...noUsage, whatsapp_marketing_count: 5000 })
    expect(dec?.lines).toHaveLength(1)
  })

  it('leaves the fee off when paid yearly but still bills usage', () => {
    expect(plan({ annual_prepay: true }, '2026-11-01')).toBeNull()
    const p = plan({ annual_prepay: true }, '2026-11-01', { ...noUsage, whatsapp_marketing_count: 4010 })
    expect(p?.lines).toHaveLength(1)
    expect(p?.description).toBe('Usage over the plan, October 2026')
  })

  it('bills the last month of usage after the term ends', () => {
    const ended = { status: 'ended', term_end: '2026-11-30' }
    const p = plan(ended, '2026-12-01', { ...noUsage, whatsapp_service_count: 4100 })
    expect(p?.lines).toHaveLength(1)
    expect(p?.lines[0].description).toContain('November 2026')
    expect(plan(ended, '2026-12-01')).toBeNull()
    expect(plan({ status: 'cancelled' }, '2026-11-01')).toBeNull()
  })

  it('adds VAT for the total', () => {
    expect(withVat(4200, 0.05)).toBe(4410)
  })
})

describe('payment reminders', () => {
  const inv = { date: '2026-10-01', payment_terms: 'Net 7 days', status: 'Sent', payment_status: 'Pending' }
  const on = (d: string) => new Date(`${d}T10:00:00`)

  it('reads the payment terms', () => {
    expect(paymentTermDays('Net 30 days')).toBe(30)
    expect(paymentTermDays('net15')).toBe(15)
    expect(paymentTermDays('100% Advance')).toBe(0)
    expect(invoiceDueDate(inv)).toBe('2026-10-08')
  })

  it('offers 3, 7 and 14 days after the due date', () => {
    expect(dueReminder(inv, 100, [], on('2026-10-10'))).toBeNull()
    expect(dueReminder(inv, 100, [], on('2026-10-11'))?.stage).toBe(3)
    expect(dueReminder(inv, 100, [3], on('2026-10-12'))).toBeNull()
    expect(dueReminder(inv, 100, [3], on('2026-10-15'))?.stage).toBe(7)
    expect(dueReminder(inv, 100, [3, 7], on('2026-10-22'))).toMatchObject({ stage: 14, daysLate: 14 })
    expect(dueReminder(inv, 100, [3, 7, 14], on('2026-11-30'))).toBeNull()
  })

  it('skips a missed early stage', () => {
    expect(dueReminder(inv, 100, [], on('2026-10-20'))?.stage).toBe(7)
    expect(dueReminder(inv, 100, [7], on('2026-10-20'))).toBeNull()
  })

  it('ignores drafts, cancelled, paid and settled invoices', () => {
    const late = on('2026-10-30')
    expect(dueReminder({ ...inv, status: 'Draft' }, 100, [], late)).toBeNull()
    expect(dueReminder({ ...inv, status: 'Cancelled' }, 100, [], late)).toBeNull()
    expect(dueReminder({ ...inv, payment_status: 'Paid' }, 100, [], late)).toBeNull()
    expect(dueReminder(inv, 0, [], late)).toBeNull()
    expect(dueReminder({ ...inv, payment_status: 'Partial' }, 50, [], late)?.stage).toBe(14)
  })

  it('writes plain messages that get firmer', () => {
    const base = { contactName: 'Sara', reference: 'RR-03-26004', balanceText: 'AED 4,410.00', dueDate: '2026-10-08', companyName: 'Red Reach' }
    expect(reminderMessage({ ...base, stage: 3, daysLate: 3 }).subject).toBe('Friendly reminder: invoice RR-03-26004')
    expect(reminderMessage({ ...base, stage: 7, daysLate: 7 }).body).toContain('7 days past its due date of 8 October 2026')
    const final = reminderMessage({ ...base, stage: 14, daysLate: 15 })
    expect(final.body).toContain('Dear Sara')
    expect(final.body).not.toContain('—')
  })
})
