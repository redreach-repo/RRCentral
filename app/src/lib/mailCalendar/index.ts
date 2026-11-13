/**
 * M4 mail/calendar provider façade.
 * Slice 3: Settings-backed provider id; only Zoho is available/implemented.
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

/** Active mail provider — Zoho until other adapters ship. */
export function getMailProvider(settings?: ProviderSettings): MailProvider {
  const id = resolveMailCalendarProviderId(settings)
  switch (id) {
    case 'zoho':
      return zohoMailProvider
    default:
      return zohoMailProvider
  }
}

/** Active calendar provider — Zoho until other adapters ship. */
export function getCalendarProvider(settings?: ProviderSettings): CalendarProvider {
  const id = resolveMailCalendarProviderId(settings)
  switch (id) {
    case 'zoho':
      return zohoCalendarProvider
    default:
      return zohoCalendarProvider
  }
}

/** Short label for Settings / status copy. */
export function activeMailCalendarProviderLabel(settings?: ProviderSettings): string {
  return getMailProvider(settings).label
}
