import { describe, expect, it } from 'vitest'
import { parseUsageMonthForm } from './usageMonth'

describe('parseUsageMonthForm', () => {
  it('rejects negative values', () => {
    const r = parseUsageMonthForm({ marketing: '-1', service: '', ai: '', leads: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Marketing/i)
  })

  it('treats blanks as zero', () => {
    const r = parseUsageMonthForm({ marketing: '', service: '10', ai: '1.5', leads: '' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({
      whatsapp_marketing_count: 0,
      whatsapp_service_count: 10,
      ai_cost_usd: 1.5,
      lead_credits_cost_usd: 0,
    })
  })
})
