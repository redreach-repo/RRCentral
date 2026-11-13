import { describe, expect, it } from 'vitest'
import { parseDeliveryContractForm } from './deliveryContract'

const base = {
  package_id: null as string | null,
  option: 'A',
  monthly_fee: '1000',
  setup_fee: '0',
  setup_fee_paid: '0',
  discount_percent: '0',
  discount_months_left: '0',
  term_start: '2026-01-01',
  term_end: '2026-12-31',
  annual_prepay: false,
  status: 'active',
  notes: '',
  auto_invoice: true,
  billing_from: null as string | null,
}

describe('parseDeliveryContractForm', () => {
  it('rejects negative monthly fee', () => {
    const r = parseDeliveryContractForm({ ...base, monthly_fee: '-1' })
    expect(r.ok).toBe(false)
  })

  it('rejects fractional discount months', () => {
    const r = parseDeliveryContractForm({ ...base, discount_months_left: '1.5' })
    expect(r.ok).toBe(false)
  })

  it('parses fees and clears billing_from when auto_invoice is off', () => {
    const r = parseDeliveryContractForm({
      ...base,
      monthly_fee: '2500.5',
      auto_invoice: false,
      billing_from: '2026-02-01',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.monthly_fee).toBe(2500.5)
    expect(r.data.billing_from).toBeNull()
  })
})
