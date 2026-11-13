import { describe, expect, it } from 'vitest'
import { parseCrmForm } from './crm'

const open = {
  company_name: 'Acme LLC',
  company_owner: '',
  address: '',
  website: '',
  trn: '',
  notes: '',
  follow_up_date: '2026-11-20',
  next_action: 'Call back',
  owner: 'sam@redreach.ae',
  pipeline_stage: 'Lead',
  quote_ref: '',
  outcome_reason: '',
  lost_note: '',
}

describe('parseCrmForm', () => {
  it('requires a company name', () => {
    const r = parseCrmForm({ ...open, company_name: ' ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/company name/i)
  })

  it('requires follow-up and next action on open deals', () => {
    const r = parseCrmForm({ ...open, follow_up_date: '', next_action: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/follow-up|next action/i)
  })

  it('accepts a valid open deal', () => {
    const r = parseCrmForm(open)
    expect(r.ok).toBe(true)
  })

  it('requires a listed lost reason and note when moving to Lost', () => {
    const r = parseCrmForm({
      ...open,
      pipeline_stage: 'Lost',
      previous_stage: 'Quoted',
      outcome_reason: 'Nope',
      lost_note: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/lost/i)
  })

  it('accepts Won with an outcome reason', () => {
    const r = parseCrmForm({
      ...open,
      pipeline_stage: 'Won',
      follow_up_date: '',
      next_action: '',
      outcome_reason: 'Price',
    })
    expect(r.ok).toBe(true)
  })
})
