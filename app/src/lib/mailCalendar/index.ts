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
  ListEventsOpts,
  ListMailOpts,
  MailMessage,
  MailProvider,
  ProviderId,
  ProviderSettings,
  SendMailOpts,
  TeamMeetingInput,
} from './types'

/** Active mail provider. Slice 1 always returns Zoho. */
export function getMailProvider(_settings?: ProviderSettings): MailProvider {
  return zohoMailProvider
}

/** Active calendar provider. Slice 1 always returns Zoho. */
export function getCalendarProvider(_settings?: ProviderSettings): CalendarProvider {
  return zohoCalendarProvider
}
