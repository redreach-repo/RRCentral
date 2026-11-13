import { describe, expect, it } from 'vitest'
import { parseCtrmTermsForm } from './ctrmTerms'

describe('parseCtrmTermsForm', () => {
  it('rejects renewal before start', () => {
    const r = parseCtrmTermsForm({
      contract_start: '2027-01-01',
      renewal_date: '2026-01-01',
      notice: '30',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/after/i)
  })

  it('rejects a bad notice period', () => {
    const r = parseCtrmTermsForm({
      contract_start: null,
      renewal_date: null,
      notice: '400',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/notice/i)
  })

  it('accepts valid dates', () => {
    const r = parseCtrmTermsForm({
      contract_start: '2026-01-01',
      renewal_date: '2027-01-01',
      notice: '30',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.notice_days).toBe(30)
  })
})
