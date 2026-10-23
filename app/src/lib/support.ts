import type { SlaState } from './sla'
import type { Ticket, TicketChannel, TicketPriority, TicketStatus } from './types'

export const TICKET_CHANNELS: { value: TicketChannel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone' },
  { value: 'in_person', label: 'In person' },
  { value: 'internal', label: 'Internal' },
]

export const TICKET_PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export const TICKET_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'waiting_on_client', label: 'Waiting on client' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

export const OPEN_STATUSES: TicketStatus[] = ['new', 'open', 'waiting_on_client']

export function isOpenTicket(t: Pick<Ticket, 'status'>): boolean {
  return OPEN_STATUSES.includes(t.status)
}

export function optionLabel<T extends string>(list: { value: T; label: string }[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value
}

export const SLA_STATE_LABELS: Record<SlaState, string> = {
  ok: 'On time',
  warning: 'Due soon',
  breached: 'Past SLA',
  met: 'Answered in time',
  missed: 'Answered late',
  none: '',
}

const PRIORITY_RANK: Record<TicketPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

/** Queue order: open tickets first, then the soonest due, then priority. */
export function sortQueue<T extends Pick<Ticket, 'status' | 'sla_due_at' | 'priority' | 'first_response_at' | 'created_at'>>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const ao = isOpenTicket(a) ? 0 : 1
    const bo = isOpenTicket(b) ? 0 : 1
    if (ao !== bo) return ao - bo
    if (ao === 1) return String(b.created_at).localeCompare(String(a.created_at))
    const ad = !a.first_response_at && a.sla_due_at ? new Date(a.sla_due_at).getTime() : Infinity
    const bd = !b.first_response_at && b.sla_due_at ? new Date(b.sla_due_at).getTime() : Infinity
    if (ad !== bd) return ad - bd
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  })
}

/** Tickets resolved in a calendar month (YYYY-MM-01). */
export function resolvedInMonth<T extends Pick<Ticket, 'resolved_at'>>(list: T[], month: string): T[] {
  const prefix = month.slice(0, 7)
  return list.filter((t) => t.resolved_at && t.resolved_at.slice(0, 7) === prefix)
}
