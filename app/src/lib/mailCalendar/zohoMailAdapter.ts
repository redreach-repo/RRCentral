import {
  isZohoConfigured,
  isZohoMailEnabled,
  listZohoInboxMessages,
  listZohoSentMessages,
  sendZohoMail,
  zohoMailWebUrl,
} from '../zoho'
import type { MailProvider } from './types'

/** Zoho Mail adapter — thin 1:1 wrap of zoho.ts. */
export const zohoMailProvider: MailProvider = {
  id: 'zoho',
  label: 'Zoho',
  isConfigured: (settings) => isZohoConfigured(settings),
  isEnabled: (settings) => isZohoMailEnabled(settings),
  sendMail: (settings, opts) => sendZohoMail(settings, opts),
  listInbox: (settings, opts) => listZohoInboxMessages(settings, opts),
  listSent: (settings, opts) => listZohoSentMessages(settings, opts),
  webUrl: (settings) => zohoMailWebUrl(settings),
}
