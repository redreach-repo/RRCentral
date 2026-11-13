import { describe, expect, it } from 'vitest'
import { DEFAULT_NDA_BODY } from '../nda'
import { parseNdaApproveForm, parseNdaDraftForm } from './ndaTemplate'

describe('parseNdaDraftForm', () => {
  it('accepts the default body', () => {
    const r = parseNdaDraftForm({ title: ' NDA ', body: DEFAULT_NDA_BODY })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.title).toBe('NDA')
  })

  it('rejects unknown placeholders', () => {
    const r = parseNdaDraftForm({ title: 'NDA', body: 'Hello {{client_nme}}' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Unknown placeholders/i)
  })
})

describe('parseNdaApproveForm', () => {
  it('requires lawyer name', () => {
    const r = parseNdaApproveForm({ approvedBy: '', approvedOn: '2026-11-13', note: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/lawyer/i)
  })
})
