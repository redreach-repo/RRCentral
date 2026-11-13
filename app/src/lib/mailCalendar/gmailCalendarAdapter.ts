import {
  createGmailTeamMeeting,
  deleteGmailCalendarEvent,
  gmailCalendarWebUrl,
  isGmailCalendarEnabled,
  isGmailConnected,
  listGmailCalendarEvents,
  listGmailCalendars,
  syncFollowUpToGmailCalendar,
} from '../gmailCalendarApi'
import type { CalendarProvider } from './types'

/** Google Calendar adapter — Phase A (calendar.events on primary). */
export const gmailCalendarProvider: CalendarProvider = {
  id: 'gmail',
  label: 'Gmail',
  isConfigured: (settings) => isGmailConnected(settings),
  isEnabled: (settings) => isGmailCalendarEnabled(settings),
  listCalendars: (settings) => listGmailCalendars(settings),
  listEvents: (settings, opts) => listGmailCalendarEvents(settings, opts),
  createTeamMeeting: (settings, input) => createGmailTeamMeeting(settings, input),
  syncFollowUp: (settings, input) => syncFollowUpToGmailCalendar(settings, input),
  deleteEvent: (settings, eventId) => deleteGmailCalendarEvent(settings, eventId),
  webUrl: (settings) => gmailCalendarWebUrl(settings),
}
