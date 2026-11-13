import {
  createTeamMeetingOnZoho,
  isZohoCalendarEnabled,
  isZohoConfigured,
  listZohoCalendarEvents,
  listZohoCalendars,
  zohoCalendarWebUrl,
} from '../zoho'
import type { CalendarProvider } from './types'

/** Zoho Calendar adapter — thin 1:1 wrap of zoho.ts (M4 slice 1). */
export const zohoCalendarProvider: CalendarProvider = {
  id: 'zoho',
  isConfigured: (settings) => isZohoConfigured(settings),
  isEnabled: (settings) => isZohoCalendarEnabled(settings),
  listCalendars: (settings) => listZohoCalendars(settings),
  listEvents: (settings, opts) => listZohoCalendarEvents(settings, opts),
  createTeamMeeting: (settings, input) => createTeamMeetingOnZoho(settings, input),
  webUrl: (settings) => zohoCalendarWebUrl(settings),
}
