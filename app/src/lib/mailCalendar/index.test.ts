import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAIL_CALENDAR_PROVIDER,
  MAIL_CALENDAR_PROVIDER_SETTING_KEY,
  activeMailCalendarProviderLabel,
  getCalendarProvider,
  getMailProvider,
  listMailCalendarProviderOptions,
  resolveMailCalendarProviderId,
} from './index'

describe('mailCalendar façade', () => {
  it('returns the Zoho mail and calendar providers by default', () => {
    expect(getMailProvider().id).toBe('zoho')
    expect(getCalendarProvider().id).toBe('zoho')
    expect(activeMailCalendarProviderLabel()).toBe('Zoho')
    expect(resolveMailCalendarProviderId()).toBe(DEFAULT_MAIL_CALENDAR_PROVIDER)
  })

  it('returns Gmail and M365 providers when selected', () => {
    expect(getMailProvider({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'gmail' }).id).toBe('gmail')
    expect(getCalendarProvider({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'gmail' }).id).toBe('gmail')
    expect(getMailProvider({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'm365' }).id).toBe('m365')
    expect(getCalendarProvider({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'm365' }).id).toBe('m365')
    expect(activeMailCalendarProviderLabel({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'm365' })).toBe(
      'Microsoft 365',
    )
  })

  it('falls back to Zoho for unavailable provider ids', () => {
    expect(resolveMailCalendarProviderId({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'imap' })).toBe(
      'zoho',
    )
  })

  it('lists Zoho, Gmail, and M365 as available; IMAP unavailable with compliance reason', () => {
    const opts = listMailCalendarProviderOptions()
    expect(opts.find((o) => o.id === 'zoho')?.available).toBe(true)
    expect(opts.find((o) => o.id === 'gmail')?.available).toBe(true)
    expect(opts.find((o) => o.id === 'm365')?.available).toBe(true)
    const imap = opts.find((o) => o.id === 'imap')
    expect(imap?.available).toBe(false)
    expect(imap?.unavailableReason || '').toMatch(/COMPLIANCE_NOTES|Gmail\/M365/i)
  })
})
