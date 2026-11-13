import {
  gmailMailWebUrl,
  isGmailConnected,
  isGmailMailEnabled,
  listGmailInbox,
  listGmailSent,
  sendGmailMail,
} from '../gmailCalendarApi'
import type { MailProvider } from './types'

/** Gmail mail adapter — Phase A send only; inbox/sent deferred to Phase B. */
export const gmailMailProvider: MailProvider = {
  id: 'gmail',
  label: 'Gmail',
  isConfigured: (settings) => isGmailConnected(settings),
  isEnabled: (settings) => isGmailMailEnabled(settings),
  sendMail: (settings, opts) => sendGmailMail(settings, opts),
  listInbox: () => listGmailInbox(),
  listSent: () => listGmailSent(),
  webUrl: (settings) => gmailMailWebUrl(settings),
}
