import { describe, expect, it } from 'vitest'
import { LOST_REASONS } from '../dealRules'
import { parseCtrmDealForm, type CtrmDealFormInput } from './ctrmDeal'

const base: CtrmDealFormInput = {
  accountId: 'acc-1',
  newCompany: '',
  stage: 'identified',
  region: 'middle_east',
  company_type: 'trading_house',
  primary_contact_id: null,
  source: 'LinkedIn',
  owner_user_id: null,
  next_action: 'Book intro call',
  next_action_date: '2026-11-20',
  lost_reason: '',
  lost_reason_code: '',
  notes: '',
  commission: null,
}

describe('parseCtrmDealForm', () => {
  it('requires a company', () => {
    const r = parseCtrmDealForm({ ...base, accountId: '', newCompany: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/company/i)
  })

  it('requires next action on open deals', () => {
    const r = parseCtrmDealForm({ ...base, next_action: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/next action/i)
  })

  it('requires next action date on open deals', () => {
    const r = parseCtrmDealForm({ ...base, next_action_date: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/date/i)
  })

  it('requires lost reason + note', () => {
    const r = parseCtrmDealForm({
      ...base,
      stage: 'lost',
      next_action: '',
      next_action_date: null,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/lost/i)
  })

  it('accepts a valid open deal', () => {
    const r = parseCtrmDealForm(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.next_action).toBe('Book intro call')
  })

  it('accepts lost with reason from the list', () => {
    const r = parseCtrmDealForm({
      ...base,
      stage: 'lost',
      next_action: '',
      next_action_date: null,
      lost_reason_code: LOST_REASONS[0],
      lost_reason: 'No budget this year',
    })
    expect(r.ok).toBe(true)
  })

  it('accepts signed without next action', () => {
    const r = parseCtrmDealForm({
      ...base,
      stage: 'signed',
      next_action: '',
      next_action_date: null,
      commission: { expected: 1000, received: 0 },
    })
    expect(r.ok).toBe(true)
  })
})
