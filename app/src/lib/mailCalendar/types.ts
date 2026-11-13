/**
 * M4 provider-neutral mail/calendar types.
 * Slice 1 shapes match today's Zoho payloads — adapters map 1:1.
 */
export type ProviderSettings = Record<string, string>

export type ProviderId = 'zoho'

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

export interface MailProvider {
  id: ProviderId
  isConfigured(settings: ProviderSettings): boolean
  isEnabled(settings: ProviderSettings): boolean
  sendMail(settings: ProviderSettings, opts: SendMailOpts): Promise<void>
  listInbox(settings: ProviderSettings, opts?: ListMailOpts): Promise<MailMessage[]>
  listSent(settings: ProviderSettings, opts?: { limit?: number }): Promise<MailMessage[]>
  webUrl(settings: ProviderSettings): string
}

export interface CalendarProvider {
  id: ProviderId
  isConfigured(settings: ProviderSettings): boolean
  isEnabled(settings: ProviderSettings): boolean
  listCalendars(settings: ProviderSettings): Promise<CalendarInfo[]>
  listEvents(settings: ProviderSettings, opts: ListEventsOpts): Promise<CalendarEvent[]>
  createTeamMeeting(settings: ProviderSettings, input: TeamMeetingInput): Promise<string>
  webUrl(settings: ProviderSettings): string
}
