import { describe, expect, it } from 'vitest'
import { parseCalendarSettingsForm } from './calendarSettings'

describe('parseCalendarSettingsForm', () => {
  it('defaults domain when empty and sync off', () => {
    const r = parseCalendarSettingsForm({ enabled: 'no', domain: '', calendarUid: '' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.enabled).toBe('no')
    expect(r.data.domain).toBe('https://calendar.zoho.com')
  })

  it('requires a calendar UID when enabling', () => {
    const r = parseCalendarSettingsForm({
      enabled: 'yes',
      domain: 'https://calendar.zoho.com',
      calendarUid: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/calendar/i)
  })

  it('rejects non-https domains', () => {
    const r = parseCalendarSettingsForm({
      enabled: 'no',
      domain: 'http://calendar.zoho.com',
      calendarUid: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/https/i)
  })

  it('accepts enabled with a UID', () => {
    const r = parseCalendarSettingsForm({
      enabled: 'YES',
      domain: 'https://calendar.zoho.com',
      calendarUid: '  uid-1  ',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.enabled).toBe('yes')
    expect(r.data.calendarUid).toBe('uid-1')
  })
})
