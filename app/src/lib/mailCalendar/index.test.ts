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

  it('reads mailCalendarProvider from settings when available', () => {
    expect(
      resolveMailCalendarProviderId({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'zoho' }),
    ).toBe('zoho')
    expect(getMailProvider({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'zoho' }).id).toBe('zoho')
  })

  it('falls back to Zoho for unknown or unavailable provider ids', () => {
    expect(
      resolveMailCalendarProviderId({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'gmail' }),
    ).toBe('zoho')
    expect(
      resolveMailCalendarProviderId({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: 'not-a-provider' }),
    ).toBe('zoho')
    expect(
      resolveMailCalendarProviderId({ [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: '' }),
    ).toBe('zoho')
  })

  it('lists Zoho as available and future providers as unavailable', () => {
    const opts = listMailCalendarProviderOptions()
    expect(opts.find((o) => o.id === 'zoho')?.available).toBe(true)
    expect(opts.find((o) => o.id === 'gmail')?.available).toBe(false)
    expect(opts.find((o) => o.id === 'm365')?.available).toBe(false)
    expect(opts.find((o) => o.id === 'imap')?.available).toBe(false)
  })
})
