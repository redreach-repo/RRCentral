import { describe, expect, it } from 'vitest'
import { LOST_REASONS } from '../dealRules'
import { parseSalesDealForm, type SalesDealFormInput } from './salesDeal'

const base: SalesDealFormInput = {
  accountId: 'acc-1',
  newCompany: '',
  stage: 'lead',
  source: 'Referral',
  owner_user_id: null,
  next_action: 'Call them back',
  next_action_date: '2026-11-20',
  lost_reason: '',
  lost_reason_code: '',
  notes: '',
  discovery_call_date: null,
  package_id: null,
  option: 'A',
  monthly_fee: 0,
  setup_fee: 0,
  discount_percent: 0,
  discount_months: 0,
  start_date: null,
  quote_reference: '',
  contract_id: null,
}

describe('parseSalesDealForm', () => {
  it('requires a company', () => {
    const r = parseSalesDealForm({ ...base, accountId: '', newCompany: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/company/i)
  })

  it('requires next action on open deals', () => {
    const r = parseSalesDealForm({ ...base, next_action: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/next action/i)
  })

  it('requires package when quote_sent', () => {
    const r = parseSalesDealForm({
      ...base,
      stage: 'quote_sent',
      next_action: 'Follow up',
      next_action_date: '2026-11-21',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/package/i)
  })

  it('requires lost reason + note', () => {
    const r = parseSalesDealForm({ ...base, stage: 'lost', next_action: '', next_action_date: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/lost/i)
  })

  it('accepts a valid open deal', () => {
    const r = parseSalesDealForm(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.next_action).toBe('Call them back')
  })

  it('accepts lost with reason from the list', () => {
    const r = parseSalesDealForm({
      ...base,
      stage: 'lost',
      next_action: '',
      next_action_date: null,
      lost_reason_code: LOST_REASONS[0],
      lost_reason: 'Budget frozen this year',
    })
    expect(r.ok).toBe(true)
  })

  it('blocks signed without a contract', () => {
    const r = parseSalesDealForm({
      ...base,
      stage: 'signed',
      next_action: '',
      next_action_date: null,
      package_id: 'pkg-1',
      monthly_fee: 500,
      contract_id: null,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Make contract/i)
  })
})
