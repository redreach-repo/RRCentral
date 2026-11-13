/**
 * M4 provider-neutral mail/calendar types.
 * Slice 1 shapes match today's Zoho payloads — adapters map 1:1.
 */
export type ProviderSettings = Record<string, string>

/** Implemented + reserved ids for the Settings switcher. */
export type ProviderId = 'zoho' | 'gmail' | 'm365' | 'imap'

export const MAIL_CALENDAR_PROVIDER_SETTING_KEY = 'mailCalendarProvider'
export const DEFAULT_MAIL_CALENDAR_PROVIDER: ProviderId = 'zoho'

export type ProviderOption = {
  id: ProviderId
  label: string
  /** When false, listed in Settings but not selectable. */
  available: boolean
  unavailableReason?: string
}

/** Catalog for Settings. Only `available: true` providers may be active. */
export const MAIL_CALENDAR_PROVIDER_OPTIONS: readonly ProviderOption[] = [
  { id: 'zoho', label: 'Zoho', available: true },
  {
    id: 'gmail',
    label: 'Gmail',
    available: true,
  },
  {
    id: 'm365',
    label: 'Microsoft 365',
    available: true,
  },
  {
    id: 'imap',
    label: 'IMAP / other',
    available: false,
    unavailableReason: 'Deferred — assess after M365 Phase A',
  },
] as const

export type SendMailOpts = {
  to: string
  subject: string
  body: string
  fromAddress?: string
}

export type ListMailOpts = {
  limit?: number
  status?: 'all' | 'read' | 'unread'
}

export type MailMessage = {
  messageId: string
  subject: string
  fromAddress: string
  sender: string
  summary: string
  receivedTime: number
  status: 'read' | 'unread'
  hasAttachment: boolean
  folderId: string
  toAddress?: string
}

export type CalendarInfo = {
  uid: string
  name: string
  isDefault: boolean
}

export type CalendarEvent = {
  uid: string
  title: string
  startAt: string
  endAt: string
  isAllDay: boolean
  organizer: string
  attendees: { email: string; status?: string }[]
  description: string
}

export type TeamMeetingInput = {
  title: string
  date: string
  startHour?: number
  startMinute?: number
  durationMinutes?: number
  description?: string
  location?: string
  attendeeEmails: string[]
  crmCompany?: string
}

export type ListEventsOpts = {
  start: Date
  end: Date
}

/** CRM follow-up → calendar event payload (provider-neutral). */
export type FollowUpEventInput = {
  company: string
  nextAction?: string
  owner?: string
  contactName?: string
  contactEmail?: string
  teamAttendeeEmails?: string[]
  followUpDate: string
  existingEventId?: string
}

export interface MailProvider {
  id: ProviderId
  label: string
  isConfigured(settings: ProviderSettings): boolean
  isEnabled(settings: ProviderSettings): boolean
  sendMail(settings: ProviderSettings, opts: SendMailOpts): Promise<void>
  listInbox(settings: ProviderSettings, opts?: ListMailOpts): Promise<MailMessage[]>
  listSent(settings: ProviderSettings, opts?: { limit?: number }): Promise<MailMessage[]>
  webUrl(settings: ProviderSettings): string
}

export interface CalendarProvider {
  id: ProviderId
  label: string
  isConfigured(settings: ProviderSettings): boolean
  isEnabled(settings: ProviderSettings): boolean
  listCalendars(settings: ProviderSettings): Promise<CalendarInfo[]>
  listEvents(settings: ProviderSettings, opts: ListEventsOpts): Promise<CalendarEvent[]>
  createTeamMeeting(settings: ProviderSettings, input: TeamMeetingInput): Promise<string>
  /** Create or update a CRM follow-up event. Returns event id (or '' when calendar disabled). */
  syncFollowUp(settings: ProviderSettings, input: FollowUpEventInput): Promise<string>
  deleteEvent(settings: ProviderSettings, eventId: string): Promise<void>
  webUrl(settings: ProviderSettings): string
}
