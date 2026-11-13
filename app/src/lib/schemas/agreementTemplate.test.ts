import { describe, expect, it } from 'vitest'
import { DEFAULT_AGREEMENT_BODY } from '../serviceAgreement'
import { parseAgreementApproveForm, parseAgreementDraftForm } from './agreementTemplate'

describe('parseAgreementDraftForm', () => {
  it('accepts the default body', () => {
    const r = parseAgreementDraftForm({ title: ' Service ', body: DEFAULT_AGREEMENT_BODY })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.title).toBe('Service')
  })

  it('rejects empty body', () => {
    const r = parseAgreementDraftForm({ title: 'X', body: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/wording/i)
  })

  it('rejects unknown placeholders', () => {
    const r = parseAgreementDraftForm({
      title: 'X',
      body: 'Hello {{client_nme}} fee {{monthly_fee}}',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/does not know/i)
  })
})

describe('parseAgreementApproveForm', () => {
  it('requires lawyer name', () => {
    const r = parseAgreementApproveForm({ approvedBy: '  ', approvedOn: '2026-11-13', note: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/lawyer/i)
  })

  it('trims fields', () => {
    const r = parseAgreementApproveForm({
      approvedBy: ' Jane Doe ',
      approvedOn: '2026-11-13',
      note: ' ok ',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.approvedBy).toBe('Jane Doe')
    expect(r.data.note).toBe('ok')
  })
})
