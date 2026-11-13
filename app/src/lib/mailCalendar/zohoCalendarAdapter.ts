import {
  createTeamMeetingOnZoho,
  deleteZohoCalendarEvent,
  isZohoCalendarEnabled,
  isZohoConfigured,
  listZohoCalendarEvents,
  listZohoCalendars,
  syncFollowUpToZohoCalendar,
  zohoCalendarWebUrl,
} from '../zoho'
import type { CalendarProvider } from './types'

/** Zoho Calendar adapter — thin 1:1 wrap of zoho.ts. */
export const zohoCalendarProvider: CalendarProvider = {
  id: 'zoho',
  label: 'Zoho',
  isConfigured: (settings) => isZohoConfigured(settings),
  isEnabled: (settings) => isZohoCalendarEnabled(settings),
  listCalendars: (settings) => listZohoCalendars(settings),
  listEvents: (settings, opts) => listZohoCalendarEvents(settings, opts),
  createTeamMeeting: (settings, input) => createTeamMeetingOnZoho(settings, input),
  syncFollowUp: (settings, input) => syncFollowUpToZohoCalendar(settings, input),
  deleteEvent: (settings, eventId) => deleteZohoCalendarEvent(settings, eventId),
  webUrl: (settings) => zohoCalendarWebUrl(settings),
}
