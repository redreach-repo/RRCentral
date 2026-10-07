import { addDays, isBefore, parseISO, startOfDay } from 'date-fns'
import type { CrmEntry } from './types'
import { normalizeCalendarEventUid } from './zoho'
import type { CalendarEventRow } from './zohoCalendarMatch'

export type ScheduleKind = 'follow_up' | 'meeting' | 'calendar'

export type ScheduleRow = {
  id: string
  kind: ScheduleKind
  sortKey: string
  whenLabel: string
  title: string
  detail: string
  owner: string
  crmId: string
  crmName: string
  quoteRef: string
  attendees: string
  overdue: boolean
}

function ymd(date: string | null | undefined): string {
  return String(date || '').slice(0, 10)
}

export function followUpsInWindow(crmEntries: CrmEntry[], daysAhead: number): CrmEntry[] {
  const today = startOfDay(new Date())
  const end = addDays(today, daysAhead)
  return crmEntries
    .filter((c) => {
      if (!c.follow_up_date) return false
      try {
        const d = startOfDay(parseISO(ymd(c.follow_up_date)))
        // Include overdue + upcoming in window
        return !isBefore(end, d)
      } catch {
        return false
      }
    })
    .sort((a, b) => ymd(a.follow_up_date).localeCompare(ymd(b.follow_up_date)))
}

export function buildScheduleRows(opts: {
  crmEntries: CrmEntry[]
  calendarEvents: CalendarEventRow[]
  daysAhead: number
}): ScheduleRow[] {
  const today = startOfDay(new Date())
  const followUps = followUpsInWindow(opts.crmEntries, opts.daysAhead)
  const linkedEventIds = new Set(
    followUps.map((c) => normalizeCalendarEventUid(c.calendar_event_id)).filter(Boolean),
  )

  const rows: ScheduleRow[] = []

  for (const c of followUps) {
    const date = ymd(c.follow_up_date)
    let overdue = false
    try {
      overdue = isBefore(parseISO(date), today)
    } catch {
      /* ignore */
    }
    rows.push({
      id: `fu-${c.id}`,
      kind: 'follow_up',
      sortKey: `${date}T00:00:00`,
      whenLabel: date,
      title: c.company_name,
      detail: c.next_action || 'Follow-up',
      owner: c.owner || '—',
      crmId: c.id,
      crmName: c.company_name,
      quoteRef: c.quote_ref || '',
      attendees: '',
      overdue,
    })
  }

  for (const ev of opts.calendarEvents) {
    const uid = normalizeCalendarEventUid(ev.uid)
    // Skip Zoho events already represented by a CRM follow-up row
    if (uid && linkedEventIds.has(uid)) continue
    if (ev.crm?.calendar_event_id) {
      const key = normalizeCalendarEventUid(ev.crm.calendar_event_id)
      if (key && linkedEventIds.has(key)) continue
    }
    if (ev.kind === 'follow_up' && ev.crm) continue

    const start = ev.startAt.slice(0, 19)
    rows.push({
      id: `cal-${ev.uid}`,
      kind: ev.kind === 'meeting' ? 'meeting' : 'calendar',
      sortKey: start || '9999',
      whenLabel: start,
      title: ev.title,
      detail: ev.description?.slice(0, 80) || '',
      owner: ev.organizer || '—',
      crmId: ev.crm?.id || '',
      crmName: ev.crm?.company_name || '',
      quoteRef: ev.crm?.quote_ref || '',
      attendees: ev.attendees.map((a) => a.email.split('@')[0]).join(', '),
      overdue: false,
    })
  }

  return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}
