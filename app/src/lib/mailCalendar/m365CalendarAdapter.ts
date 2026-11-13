import {
  createM365TeamMeeting,
  deleteM365CalendarEvent,
  isM365CalendarEnabled,
  isM365Connected,
  listM365CalendarEvents,
  listM365Calendars,
  m365CalendarWebUrl,
  syncFollowUpToM365Calendar,
} from '../m365MailCalendarApi'
import type { CalendarProvider } from './types'

/** Microsoft 365 calendar adapter — Phase A Calendars.ReadWrite. */
export const m365CalendarProvider: CalendarProvider = {
  id: 'm365',
  label: 'Microsoft 365',
  isConfigured: (settings) => isM365Connected(settings),
  isEnabled: (settings) => isM365CalendarEnabled(settings),
  listCalendars: (settings) => listM365Calendars(settings),
  listEvents: (settings, opts) => listM365CalendarEvents(settings, opts),
  createTeamMeeting: (settings, input) => createM365TeamMeeting(settings, input),
  syncFollowUp: (settings, input) => syncFollowUpToM365Calendar(settings, input),
  deleteEvent: (settings, eventId) => deleteM365CalendarEvent(settings, eventId),
  webUrl: () => m365CalendarWebUrl(),
}
