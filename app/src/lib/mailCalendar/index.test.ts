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
    expect(getCalendarProvider().syncFollowUp).toBeTypeOf('function')
    expect(getCalendarProvider().deleteEvent).toBeTypeOf('function')
    expect(activeMailCalendarProviderLabel()).toBe('Zoho')
    expect(resolveMailCalendarProviderId()).toBe(DEFAULT_MAIL_CALENDAR_PROVIDER)
  })

  it('returns Gmail providers when mailCalendarProvider=gmail', () => {
    const settings = { [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'gmail' }
    expect(resolveMailCalendarProviderId(settings)).toBe('gmail')
    expect(getMailProvider(settings).id).toBe('gmail')
    expect(getCalendarProvider(settings).id).toBe('gmail')
    expect(activeMailCalendarProviderLabel(settings)).toBe('Gmail')
  })

  it('falls back to Zoho for unknown or unavailable provider ids', () => {
    expect(
      resolveMailCalendarProviderId({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'm365' }),
    ).toBe('zoho')
    expect(
      resolveMailCalendarProviderId({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'not-a-provider' }),
    ).toBe('zoho')
  })

  it('lists Zoho and Gmail as available; M365/IMAP unavailable with Phase A reasons', () => {
    const opts = listMailCalendarProviderOptions()
    expect(opts.find((o) => o.id === 'zoho')?.available).toBe(true)
    expect(opts.find((o) => o.id === 'gmail')?.available).toBe(true)
    expect(opts.find((o) => o.id === 'm365')?.available).toBe(false)
    expect(opts.find((o) => o.id === 'm365')?.unavailableReason).toMatch(/Phase A/)
    expect(opts.find((o) => o.id === 'imap')?.available).toBe(false)
  })
})
