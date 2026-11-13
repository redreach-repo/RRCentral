import {
  isZohoConfigured,
  isZohoMailEnabled,
  listZohoInboxMessages,
  listZohoSentMessages,
  sendZohoMail,
  zohoMailWebUrl,
} from '../zoho'
import type { MailProvider } from './types'

/** Zoho Mail adapter — thin 1:1 wrap of zoho.ts (M4 slice 1). */
export const zohoMailProvider: MailProvider = {
  id: 'zoho',
  isConfigured: (settings) => isZohoConfigured(settings),
  isEnabled: (settings) => isZohoMailEnabled(settings),
  sendMail: (settings, opts) => sendZohoMail(settings, opts),
  listInbox: (settings, opts) => listZohoInboxMessages(settings, opts),
  listSent: (settings, opts) => listZohoSentMessages(settings, opts),
  webUrl: (settings) => zohoMailWebUrl(settings),
}
