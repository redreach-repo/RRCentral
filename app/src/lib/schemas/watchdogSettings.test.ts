import { describe, expect, it } from 'vitest'
import { parseWatchdogSettingsForm } from './watchdogSettings'

describe('parseWatchdogSettingsForm', () => {
  it('accepts whole days 1–365', () => {
    const r = parseWatchdogSettingsForm({ crm: '7', sales: '14', ctrm: '30' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({ crm: 7, sales: 14, ctrm: 30 })
  })

  it('rejects zero or fractional days with pipeline label', () => {
    const r = parseWatchdogSettingsForm({ crm: '0', sales: '14', ctrm: '30' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/CRM leads/)
  })

  it('rejects values over 365', () => {
    const r = parseWatchdogSettingsForm({ crm: '7', sales: '400', ctrm: '30' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/AI CRM sales/)
  })
})
