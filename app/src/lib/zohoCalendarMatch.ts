import { normalizeCalendarEventUid, type ZohoCalendarEvent } from './zoho'
import type { CrmEntry } from './types'

export type CalendarEventRow = ZohoCalendarEvent & {
  crm: CrmEntry | null
  kind: 'follow_up' | 'meeting' | 'other'
}

export function matchCrmToCalendarEvent(
  crmEntries: CrmEntry[],
  event: Pick<ZohoCalendarEvent, 'uid' | 'title'>,
): CrmEntry | null {
  const uidKey = normalizeCalendarEventUid(event.uid)
  if (uidKey) {
    const byId = crmEntries.find(
      (c) => normalizeCalendarEventUid(c.calendar_event_id) === uidKey,
    )
    if (byId) return byId
  }
  const prefix = 'Follow-up: '
  if (event.title.startsWith(prefix)) {
    const company = event.title.slice(prefix.length).trim().toLowerCase()
    return (
      crmEntries.find((c) => c.company_name.trim().toLowerCase() === company) || null
    )
  }
  return null
}

export function classifyCalendarEvent(title: string): CalendarEventRow['kind'] {
  if (title.startsWith('Follow-up: ')) return 'follow_up'
  if (/meeting|visit|call/i.test(title)) return 'meeting'
  return 'other'
}

export function enrichCalendarEvents(
  events: ZohoCalendarEvent[],
  crmEntries: CrmEntry[],
): CalendarEventRow[] {
  return events.map((event) => {
    const crm = matchCrmToCalendarEvent(crmEntries, event)
    return { ...event, crm, kind: classifyCalendarEvent(event.title) }
  })
}
