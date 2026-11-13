import { describe, expect, it } from 'vitest'
import { parseObligationForm } from './obligation'

const base = {
  company_name: 'Sample Client LLC',
  crm_id: '',
  legal_document_id: null as string | null,
  title: 'Return confidential materials',
  description: '',
  owner_party: 'counterparty' as const,
  due_date: '2026-12-01' as string | null,
  status: 'open' as const,
}

describe('parseObligationForm', () => {
  it('accepts a valid obligation', () => {
    const parsed = parseObligationForm(base)
    expect(parsed.ok).toBe(true)
  })

  it('rejects a blank company', () => {
    const parsed = parseObligationForm({ ...base, company_name: '' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/company/i)
  })

  it('rejects a bad due date', () => {
    const parsed = parseObligationForm({ ...base, due_date: '01-12-2026' })
    expect(parsed.ok).toBe(false)
  })
})
