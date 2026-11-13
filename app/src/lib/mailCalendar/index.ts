/**
 * M4 mail/calendar provider façade.
 * Slice 1: Zoho only. Call sites should use getMailProvider / getCalendarProvider.
 */
import type { CalendarProvider, MailProvider, ProviderSettings } from './types'
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
  ProviderSettings,
  SendMailOpts,
  TeamMeetingInput,
} from './types'

/** Active mail provider. Slice 1–2 always return Zoho (no Settings switch yet). */
export function getMailProvider(_settings?: ProviderSettings): MailProvider {
  return zohoMailProvider
}

/** Active calendar provider. Slice 1–2 always return Zoho (no Settings switch yet). */
export function getCalendarProvider(_settings?: ProviderSettings): CalendarProvider {
  return zohoCalendarProvider
}

/** Short label for Settings / status copy. */
export function activeMailCalendarProviderLabel(settings?: ProviderSettings): string {
  return getMailProvider(settings).label
}
