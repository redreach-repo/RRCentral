import type { CrmEntry } from './types'
import { hydrateContacts } from './contacts'
import type { ZohoInboxMessage } from './zoho'

export type CrmEmailMatch = {
  crmId: string
  companyName: string
  matchedEmail: string
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function extractEmails(text: string): string[] {
  if (!text) return []
  const found = text.match(EMAIL_RE) || []
  return [...new Set(found.map((e) => e.toLowerCase()))]
}

/** Build email → CRM company lookup from contacts + legacy flat fields. */
export function buildCrmEmailIndex(entries: CrmEntry[]): Map<string, CrmEmailMatch> {
  const map = new Map<string, CrmEmailMatch>()
  for (const entry of entries) {
    const emails = new Set<string>()
    for (const c of hydrateContacts(entry)) {
      for (const e of extractEmails(c.email || '')) emails.add(e)
    }
    for (const e of extractEmails(entry.email_phone || '')) emails.add(e)
    for (const email of emails) {
      if (!map.has(email)) {
        map.set(email, {
          crmId: entry.id,
          companyName: entry.company_name,
          matchedEmail: email,
        })
      }
    }
  }
  return map
}

export function matchInboxMessageToCrm(
  message: Pick<ZohoInboxMessage, 'fromAddress' | 'toAddress' | 'sender'>,
  index: Map<string, CrmEmailMatch>,
): CrmEmailMatch | null {
  const candidates = [
    ...extractEmails(message.fromAddress || ''),
    ...extractEmails(message.toAddress || ''),
    ...extractEmails(message.sender || ''),
  ]
  for (const email of candidates) {
    const hit = index.get(email)
    if (hit) return hit
  }
  return null
}

export type InboxRow = ZohoInboxMessage & {
  crm: CrmEmailMatch | null
}

export function attachCrmMatches(
  messages: ZohoInboxMessage[],
  entries: CrmEntry[],
): InboxRow[] {
  const index = buildCrmEmailIndex(entries)
  return messages.map((m) => ({
    ...m,
    crm: matchInboxMessageToCrm(m, index),
  }))
}
