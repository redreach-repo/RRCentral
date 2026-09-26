import { isBefore, isSameDay, parseISO, startOfDay } from 'date-fns'
import type { CrmEntry } from './types'

export type FollowBucket = 'All' | 'Due' | 'Overdue' | 'Today' | 'Upcoming' | 'None'

export type CrmViewMode = 'list' | 'board'

export type DueCounts = {
  overdue: number
  today: number
  upcoming: number
  none: number
  mine: number
}

export function resolveSalesOwnerName(
  userEmail: string | undefined,
  owners: { email: string; name: string }[],
): string {
  if (!userEmail) return ''
  const match = owners.find((o) => o.email.toLowerCase() === userEmail.toLowerCase())
  return (match?.name || userEmail).trim()
}

export function followUpBucket(dateStr: string | null | undefined, today = startOfDay(new Date())): FollowBucket {
  if (!dateStr) return 'None'
  try {
    const d = startOfDay(parseISO(dateStr.slice(0, 10)))
    const ref = startOfDay(today)
    if (isSameDay(d, ref)) return 'Today'
    if (isBefore(d, ref)) return 'Overdue'
    return 'Upcoming'
  } catch {
    return 'None'
  }
}

export function matchesFollowFilter(
  entry: CrmEntry,
  filter: FollowBucket,
  today = startOfDay(new Date()),
): boolean {
  if (filter === 'All') return true
  const bucket = followUpBucket(entry.follow_up_date, today)
  if (filter === 'Due') return bucket === 'Overdue' || bucket === 'Today'
  return bucket === filter
}

export function computeDueCounts(
  entries: CrmEntry[],
  myOwnerName: string,
  today = startOfDay(new Date()),
): DueCounts {
  const counts: DueCounts = { overdue: 0, today: 0, upcoming: 0, none: 0, mine: 0 }
  for (const e of entries) {
    if (myOwnerName && (e.owner || '') === myOwnerName) counts.mine += 1
    const bucket = followUpBucket(e.follow_up_date, today)
    if (bucket === 'Overdue') counts.overdue += 1
    else if (bucket === 'Today') counts.today += 1
    else if (bucket === 'Upcoming') counts.upcoming += 1
    else counts.none += 1
  }
  return counts
}

/** Sort open deals by urgency: overdue → today → upcoming → none, then company. */
export function sortByFollowUpUrgency(a: CrmEntry, b: CrmEntry): number {
  const rank = (e: CrmEntry) => {
    const bucket = followUpBucket(e.follow_up_date)
    if (bucket === 'Overdue') return 0
    if (bucket === 'Today') return 1
    if (bucket === 'Upcoming') return 2
    return 3
  }
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  const da = a.follow_up_date || ''
  const db = b.follow_up_date || ''
  if (da !== db) return da.localeCompare(db)
  return (a.company_name || '').localeCompare(b.company_name || '')
}

export function crmSearchHaystack(entry: CrmEntry): string {
  const contacts = entry.contacts || []
  return [
    entry.company_name,
    entry.company_owner,
    entry.owner,
    entry.address,
    entry.trn,
    entry.quote_ref,
    entry.notes,
    entry.next_action,
    entry.pipeline_stage,
    entry.outcome_reason,
    entry.primary_contact,
    entry.email_phone,
    entry.mobile_number,
    ...contacts.flatMap((c) => [c.name, c.email, c.phone, c.role]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
