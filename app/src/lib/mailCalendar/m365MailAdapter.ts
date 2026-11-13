import {
  isM365Connected,
  isM365MailEnabled,
  listM365Inbox,
  listM365Sent,
  m365MailWebUrl,
  sendM365Mail,
} from '../m365MailCalendarApi'
import type { MailProvider } from './types'

/** Microsoft 365 mail adapter — Phase A send + Phase B inbox/sent. */
export const m365MailProvider: MailProvider = {
  id: 'm365',
  label: 'Microsoft 365',
  isConfigured: (settings) => isM365Connected(settings),
  isEnabled: (settings) => isM365MailEnabled(settings),
  sendMail: (settings, opts) => sendM365Mail(settings, opts),
  listInbox: (settings, opts) => listM365Inbox(settings, opts),
  listSent: (settings, opts) => listM365Sent(settings, opts),
  webUrl: () => m365MailWebUrl(),
}
