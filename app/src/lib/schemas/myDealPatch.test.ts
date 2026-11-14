import { describe, expect, it } from 'vitest'
import { parseMyDealPatchForm } from './myDealPatch'

const base = {
  next_action: 'Call back',
  next_action_date: '2026-11-20',
  owner_user_id: 'u1',
  notes: '  warm  ',
  quote_ref: ' RR-01 ',
  source: ' LinkedIn ',
  pipeline: 'crm' as const,
  open: true,
}

describe('parseMyDealPatchForm', () => {
  it('rejects open deal without next action', () => {
    const r = parseMyDealPatchForm({ ...base, next_action: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/next action/i)
  })

  it('parses CRM quote_ref and trims notes', () => {
    const r = parseMyDealPatchForm(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.notes).toBe('warm')
    expect(r.data.quote_ref).toBe('RR-01')
    expect(r.data.source).toBeUndefined()
  })

  it('parses sales source instead of quote_ref', () => {
    const r = parseMyDealPatchForm({ ...base, pipeline: 'sales' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.source).toBe('LinkedIn')
    expect(r.data.quote_ref).toBeUndefined()
  })
})
