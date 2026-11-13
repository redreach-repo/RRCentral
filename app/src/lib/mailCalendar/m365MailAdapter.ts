import {
  isM365Connected,
  isM365MailEnabled,
  listM365Inbox,
  listM365Sent,
  m365MailWebUrl,
  sendM365Mail,
} from '../m365MailCalendarApi'
import type { MailProvider } from './types'

/** Microsoft 365 mail adapter — Phase A send only. */
export const m365MailProvider: MailProvider = {
  id: 'm365',
  label: 'Microsoft 365',
  isConfigured: (settings) => isM365Connected(settings),
  isEnabled: (settings) => isM365MailEnabled(settings),
  sendMail: (settings, opts) => sendM365Mail(settings, opts),
  listInbox: () => listM365Inbox(),
  listSent: () => listM365Sent(),
  webUrl: () => m365MailWebUrl(),
}
