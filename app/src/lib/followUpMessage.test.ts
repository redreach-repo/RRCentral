import { describe, expect, it } from 'vitest'
import {
  buildFollowUpWhatsAppMessage,
  pickFollowUpDocument,
} from './followUpMessage'
import type { CrmEntry, Invoice, Quotation } from './types'

function quote(partial: Partial<Quotation>): Quotation {
  return {
    id: partial.id || '1',
    client: partial.client || 'Acme LLC',
    vertical: '',
    reference_number: partial.reference_number || '',
    date: partial.date ?? '2026-07-15',
    description: '',
    amount: partial.amount ?? 12500,
    status: partial.status || 'Sent',
    division_code: '01',
    base_reference: '',
    revision: 0,
    quote_id: partial.quote_id || 'Q-1',
    payment_terms: '',
    moq: '',
    notes: '',
    delivery_terms: '',
    outcome_reason: '',
    valid_until: partial.valid_until ?? '2026-07-29',
    currency: 'AED',
    quotation_currency: 'AED',
    payment_currency: 'AED',
    supplier_currency: 'AED',
    booking_currency: 'AED',
    fx_rate: 1,
    fx_rate_date: null,
    fx_rate_approved_by: '',
    fx_rate_approved_at: null,
    base_amount: partial.amount ?? 12500,
    conversion_fee_estimate: 0,
    bank_fee_estimate: 0,
    charges_borne_by: 'Customer',
    net_amount_required: '',
    accept_other_payment_currency: true,
    rate_valid_until: null,
    payment_instructions: '',
    supplier_cost_base: 0,
    estimated_gross_profit_base: 0,
    created_by: '',
    updated_by: '',
    created_at: partial.created_at || '2026-07-15T10:00:00Z',
    updated_at: '',
  }
}

function invoice(partial: Partial<Invoice>): Invoice {
  return {
    id: partial.id || 'i1',
    client: partial.client || 'Acme LLC',
    vertical: '',
    reference_number: partial.reference_number || 'RR-01-26010',
    date: partial.date ?? '2026-07-20',
    description: '',
    amount: partial.amount ?? 8000,
    status: partial.status || 'Sent',
    payment_status: partial.payment_status || 'Pending',
    payment_terms: '',
    moq: '',
    notes: '',
    delivery_terms: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
  }
}

const entry = {
  id: 'c1',
  company_name: 'Acme LLC',
  quote_ref: 'RR-01-26003',
  next_action: 'Follow up on quote',
} as CrmEntry

describe('pickFollowUpDocument', () => {
  it('uses quote_ref when present', () => {
    const doc = pickFollowUpDocument({
      company: 'Acme LLC',
      quoteRef: 'RR-01-26003',
      quotes: [
        quote({ reference_number: 'RR-01-26003', status: 'Sent', date: '2026-07-15' }),
        quote({ id: '2', reference_number: 'RR-01-26099', status: 'Finalized' }),
      ],
      invoices: [],
    })
    expect(doc?.kind).toBe('quote')
    expect(doc?.ref).toBe('RR-01-26003')
    expect(doc?.dateLabel).toBe('15 Jul 2026')
  })

  it('prefers open invoice when next action is payment', () => {
    const doc = pickFollowUpDocument({
      company: 'Acme LLC',
      quoteRef: 'RR-01-26003',
      nextAction: 'Collect payment',
      quotes: [quote({ reference_number: 'RR-01-26003', status: 'Awarded' })],
      invoices: [invoice({ payment_status: 'Pending' })],
    })
    expect(doc?.kind).toBe('invoice')
    expect(doc?.ref).toBe('RR-01-26010')
  })
})

describe('buildFollowUpWhatsAppMessage', () => {
  it('builds quote status follow-up with date and ask', () => {
    const doc = pickFollowUpDocument({
      company: 'Acme LLC',
      quoteRef: 'RR-01-26003',
      quotes: [quote({ reference_number: 'RR-01-26003', status: 'Sent' })],
      invoices: [],
    })
    const text = buildFollowUpWhatsAppMessage({
      entry,
      contactName: 'Ahmed',
      companyName: 'Red Reach Middle East FZE',
      doc,
    })
    expect(text).toContain('Ahmed')
    expect(text).toContain('RR-01-26003')
    expect(text).toContain('15 Jul 2026')
    expect(text).toContain('Kindly update us on the status')
    expect(text).toContain('AED')
  })

  it('builds invoice payment follow-up', () => {
    const doc = pickFollowUpDocument({
      company: 'Acme LLC',
      nextAction: 'Collect payment',
      quotes: [],
      invoices: [invoice({ payment_status: 'Partial' })],
    })
    const text = buildFollowUpWhatsAppMessage({
      entry,
      contactName: 'Sara',
      companyName: 'Red Reach Middle East FZE',
      doc,
    })
    expect(text).toContain('invoice')
    expect(text).toContain('20 Jul 2026')
    expect(text).toContain('Partial')
    expect(text).toContain('payment status')
  })
})
