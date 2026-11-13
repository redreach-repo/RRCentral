/**
 * M4 mail/calendar provider façade.
 * Slice 5: Zoho + Gmail Phase A (send + calendar); inbox stays Zoho/Phase B.
 */
import type {
  CalendarProvider,
  MailProvider,
  ProviderId,
  ProviderOption,
  ProviderSettings,
} from './types'
import {
  DEFAULT_MAIL_CALENDAR_PROVIDER,
  MAIL_CALENDAR_PROVIDER_OPTIONS,
  MAIL_CALENDAR_PROVIDER_SETTING_KEY,
} from './types'
import { gmailCalendarProvider } from './gmailCalendarAdapter'
import { gmailMailProvider } from './gmailMailAdapter'
import { zohoCalendarProvider } from './zohoCalendarAdapter'
import { zohoMailProvider } from './zohoMailAdapter'

export type {
  CalendarEvent,
  CalendarInfo,
  CalendarProvider,
  FollowUpEventInput,
  ListEventsOpts,
  ListMailOpts,
  MailMessage,
  MailProvider,
  ProviderId,
  ProviderOption,
  ProviderSettings,
  SendMailOpts,
  TeamMeetingInput,
} from './types'

export {
  DEFAULT_MAIL_CALENDAR_PROVIDER,
  MAIL_CALENDAR_PROVIDER_OPTIONS,
  MAIL_CALENDAR_PROVIDER_SETTING_KEY,
} from './types'

function isProviderId(value: string): value is ProviderId {
  return MAIL_CALENDAR_PROVIDER_OPTIONS.some((o) => o.id === value)
}

/** Resolve the active provider id from Settings (falls back to Zoho). */
export function resolveMailCalendarProviderId(settings?: ProviderSettings): ProviderId {
  const raw = (settings?.[MAIL_CALENDAR_PROVIDER_SETTING_KEY] || '').trim().toLowerCase()
  if (!raw || !isProviderId(raw)) return DEFAULT_MAIL_CALENDAR_PROVIDER
  const opt = MAIL_CALENDAR_PROVIDER_OPTIONS.find((o) => o.id === raw)
  if (!opt?.available) return DEFAULT_MAIL_CALENDAR_PROVIDER
  return opt.id
}

export function listMailCalendarProviderOptions(): readonly ProviderOption[] {
  return MAIL_CALENDAR_PROVIDER_OPTIONS
}

/** Active mail provider. */
export function getMailProvider(settings?: ProviderSettings): MailProvider {
  switch (resolveMailCalendarProviderId(settings)) {
    case 'gmail':
      return gmailMailProvider
    case 'zoho':
    default:
      return zohoMailProvider
  }
}

/** Active calendar provider. */
export function getCalendarProvider(settings?: ProviderSettings): CalendarProvider {
  switch (resolveMailCalendarProviderId(settings)) {
    case 'gmail':
      return gmailCalendarProvider
    case 'zoho':
    default:
      return zohoCalendarProvider
  }
}

/** Short label for Settings / status copy. */
export function activeMailCalendarProviderLabel(settings?: ProviderSettings): string {
  return getMailProvider(settings).label
}
