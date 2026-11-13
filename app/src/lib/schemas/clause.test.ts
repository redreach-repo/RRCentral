import { describe, expect, it } from 'vitest'
import { parseClauseForm } from './clause'

const base = {
  clause_key: 'recipient_care',
  title: 'Care of information',
  body: 'Protect Confidential Information with reasonable care.',
  category: 'obligations' as const,
  status: 'draft' as const,
  sort_order: 40,
  notes: '',
}

describe('parseClauseForm', () => {
  it('accepts a valid clause', () => {
    const parsed = parseClauseForm(base)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data.clause_key).toBe('recipient_care')
  })

  it('rejects a bad key', () => {
    const parsed = parseClauseForm({ ...base, clause_key: '1bad' })
    expect(parsed.ok).toBe(false)
  })

  it('rejects a blank title', () => {
    const parsed = parseClauseForm({ ...base, title: '  ' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/title/i)
  })
})
