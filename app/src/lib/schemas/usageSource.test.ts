import { describe, expect, it } from 'vitest'
import { parseUsageSourceForm } from './usageSource'

describe('parseUsageSourceForm', () => {
  it('rejects empty form', () => {
    const r = parseUsageSourceForm({ phones: '  ', workspace: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/WhatsApp|workspace/i)
  })

  it('rejects phones that are not numbers', () => {
    const r = parseUsageSourceForm({ phones: 'abc', workspace: '' })
    expect(r.ok).toBe(false)
  })

  it('accepts workspace only', () => {
    const r = parseUsageSourceForm({ phones: '', workspace: '  wrkspc_1  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.workspace).toBe('wrkspc_1')
  })

  it('accepts a valid phone list', () => {
    const r = parseUsageSourceForm({ phones: '971501234567, 971509999999', workspace: '' })
    expect(r.ok).toBe(true)
  })
})
