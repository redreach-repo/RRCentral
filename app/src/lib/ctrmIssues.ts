/**
 * CTRM Next client issues (Wave 5, PR W). Issues a CTRM Next client raises
 * live on the support desk with the channel "CTRM Next", plus the vendor's
 * ticket number, the vendor side status and the date the client was last
 * sent an update. An open issue with no update to the client for 2 working
 * days is flagged. Numbers are typed in by hand: no link to the vendor.
 * Pure (bundled into the daily-digest function).
 */
import { DEFAULT_WORKING_CALENDAR, addWorkingHours, workingDayHours, type WorkingCalendar } from './sla'
import { isOpenTicket } from './support'
import type { Ticket, VendorStatus } from './types'

export const CTRM_CHANNEL = 'ctrm_next' as const

export const VENDOR_STATUSES: { value: Exclude<VendorStatus, ''>; label: string }[] = [
  { value: 'not_raised', label: 'Not raised' },
  { value: 'raised', label: 'Raised' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'waiting_for_client', label: 'Waiting for client' },
]
export const vendorStatusLabel = (s: string | null | undefined) => VENDOR_STATUSES.find((o) => o.value === s)?.label ?? 'Not raised'

/** Working days without an update to the client before an issue is flagged. */
export const CLIENT_UPDATE_DAYS = 2

/** Shown on the issue form. */
export const NO_TRADE_DATA_NOTE =
  'Describe the problem only. Never paste client trade data: no trades, positions, prices, counterparties or screenshots of their book.'

export type IssueRow = Pick<Ticket, 'id' | 'subject' | 'account_id' | 'status' | 'created_at' | 'channel' | 'assignee_user_id'> &
  Pick<Ticket, 'vendor_ticket_ref' | 'vendor_status' | 'client_updated_at' | 'vendor_fixed_at'>

export const isCtrmIssue = (t: Pick<Ticket, 'channel'>) => t.channel === CTRM_CHANNEL

/** When the client must next hear from us: 2 working days after the last update (or after it was raised). */
export function clientUpdateDue(t: Pick<IssueRow, 'created_at' | 'client_updated_at'>, cal: WorkingCalendar = DEFAULT_WORKING_CALENDAR): Date {
  const last = new Date(t.client_updated_at || t.created_at)
  return addWorkingHours(last, CLIENT_UPDATE_DAYS * workingDayHours(cal), cal)
}

/** An open issue whose client has had no update for 2 working days. */
export function needsClientUpdate(t: IssueRow, now: Date = new Date(), cal: WorkingCalendar = DEFAULT_WORKING_CALENDAR): boolean {
  if (!isCtrmIssue(t) || !isOpenTicket(t)) return false
  return clientUpdateDue(t, cal).getTime() <= now.getTime()
}

const daysOpen = (t: Pick<IssueRow, 'created_at'>, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(t.created_at).getTime()) / 86_400_000))

/** Open CTRM Next issues, oldest first. */
export function openIssues<T extends IssueRow>(tickets: T[]): T[] {
  return tickets.filter((t) => isCtrmIssue(t) && isOpenTicket(t)).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export type IssueGroup<T> = { accountId: string | null; name: string; issues: T[]; flagged: number }

/** Issues grouped by client: groups with a flagged issue first, then by name; issues oldest first. */
export function groupIssuesByClient<T extends IssueRow>(
  tickets: T[],
  nameOf: (accountId: string | null) => string,
  now: Date = new Date(),
  cal: WorkingCalendar = DEFAULT_WORKING_CALENDAR,
): IssueGroup<T>[] {
  const groups = new Map<string, IssueGroup<T>>()
  for (const t of tickets.filter(isCtrmIssue).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = t.account_id ?? ''
    const g = groups.get(key) ?? { accountId: t.account_id, name: nameOf(t.account_id), issues: [], flagged: 0 }
    g.issues.push(t)
    if (needsClientUpdate(t, now, cal)) g.flagged++
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => (b.flagged > 0 ? 1 : 0) - (a.flagged > 0 ? 1 : 0) || a.name.localeCompare(b.name))
}

/** The line under an issue: how long open, vendor side, last client update. */
export function issueDetail(t: IssueRow, clientName: string, now: Date = new Date(), cal: WorkingCalendar = DEFAULT_WORKING_CALENDAR): string {
  const days = daysOpen(t, now)
  const parts = [
    clientName,
    `open ${days} ${days === 1 ? 'day' : 'days'}`,
    `vendor: ${vendorStatusLabel(t.vendor_status)}${t.vendor_ticket_ref ? ` (${t.vendor_ticket_ref})` : ''}`,
  ]
  if (needsClientUpdate(t, now, cal)) parts.push(t.client_updated_at ? `no update to the client since ${t.client_updated_at.slice(0, 10)}` : 'client not updated yet')
  return parts.join(', ')
}
