/**
 * Weekly CTRM Next client update (Wave 5, PR Z). Every Thursday the
 * client-updates Edge Function drafts one short update per CTRM Next client
 * with a signed deal: issues fixed this week, issues still open (with the
 * vendor status in the client's words) and the next session or milestone.
 * Drafts wait in an Approve queue; one tap sends by email or WhatsApp and the
 * send is logged on the account timeline. AI help may only tidy the wording.
 *
 * Relationship facts only: never trades, positions or prices.
 * Pure (bundled into supabase/functions/client-updates).
 */
import { format, parseISO, startOfWeek } from 'date-fns'
import { CTRM_CHANNEL } from './ctrmIssues'
import { sessionKindLabel } from './ctrmSessions'
import { reminderRecipient, type ReminderContact } from './paymentReminder'
import { isOpenTicket } from './support'
import type { TicketStatus, VendorStatus } from './types'

export type ClientUpdateStatus = 'draft' | 'sent' | 'skipped'
export type ClientUpdateChannel = 'email' | 'whatsapp'

export const CLIENT_UPDATE_STATUSES: { value: ClientUpdateStatus; label: string }[] = [
  { value: 'draft', label: 'Waiting for approval' },
  { value: 'sent', label: 'Sent' },
  { value: 'skipped', label: 'Skipped' },
]

export const CLIENT_UPDATE_BODY_MAX = 4000

/** The Monday of the week `day` falls in, `YYYY-MM-DD`. */
export function weekStartFor(day: Date): string {
  return format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export const weekLabelOf = (weekStart: string) => `week of ${format(parseISO(weekStart.slice(0, 10)), 'd MMMM yyyy')}`

/** What each vendor status means, in words for the client. */
const CLIENT_WORDS: Record<string, string> = {
  '': 'we are looking into it',
  not_raised: 'we are looking into it',
  raised: 'raised with the CTRM Next team',
  in_progress: 'the CTRM Next team is working on it',
  fixed: 'fixed by the CTRM Next team, we are checking it with you',
  waiting_for_client: 'waiting for a reply from your side',
}
export const clientWordsFor = (s: VendorStatus | string | null | undefined) => CLIENT_WORDS[s || ''] ?? CLIENT_WORDS['']

export type UpdateAccount = { id: string; name: string; type: string; status?: string | null }
export type UpdateDeal = { account_id: string; stage: string; next_action: string; next_action_date: string | null }
export type UpdateIssue = {
  account_id: string | null
  subject: string
  status: TicketStatus
  channel: string
  vendor_status: VendorStatus | string
  vendor_ticket_ref: string
  vendor_fixed_at: string | null
  resolved_at: string | null
}
export type UpdateSession = { account_id: string; kind: string; session_date: string; topics_left: string[] }

/** CTRM Next clients (a signed deal) with no draft for the week yet. */
export function updateCandidates(input: {
  accounts: UpdateAccount[]
  deals: Pick<UpdateDeal, 'account_id' | 'stage'>[]
  existing: { account_id: string; week_start: string }[]
  weekStart: string
}): UpdateAccount[] {
  const done = new Set(input.existing.filter((e) => e.week_start.slice(0, 10) === input.weekStart).map((e) => e.account_id))
  const signed = new Set(input.deals.filter((d) => d.stage === 'signed').map((d) => d.account_id))
  return input.accounts
    .filter((a) => a.type === 'ctrm_prospect' && a.status !== 'archived' && signed.has(a.id) && !done.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export type UpdateFacts = { fixed: string[]; open: string[]; next: string[] }

const dayLabel = (d: string) => format(parseISO(d.slice(0, 10)), 'EEEE d MMMM')

/**
 * What one client's update says. Fixed: issues resolved or fixed by the
 * vendor since Monday. Open: every other open issue. Next: the next session
 * from today, then the deal's next step if it has a date from today.
 */
export function updateFacts(input: {
  accountId: string
  issues: UpdateIssue[]
  sessions: UpdateSession[]
  deals: UpdateDeal[]
  weekStart: string
  today: string
}): UpdateFacts {
  // Monday 00:00 in Dubai (UTC+4, no daylight saving).
  const since = new Date(`${input.weekStart.slice(0, 10)}T00:00:00+04:00`)
  const isSince = (iso: string | null) => !!iso && new Date(iso) >= since
  const mine = input.issues.filter((t) => t.account_id === input.accountId && t.channel === CTRM_CHANNEL)
  const fixedNow = mine.filter((t) => isSince(t.resolved_at) || (t.vendor_status === 'fixed' && isSince(t.vendor_fixed_at)))
  const fixed = fixedNow.map((t) => t.subject.trim())
  const open = mine
    .filter((t) => isOpenTicket(t) && !fixedNow.includes(t))
    .map((t) => `${t.subject.trim()}: ${clientWordsFor(t.vendor_status)}${t.vendor_ticket_ref.trim() ? ` (ref ${t.vendor_ticket_ref.trim()})` : ''}`)

  const next: string[] = []
  const session = input.sessions
    .filter((s) => s.account_id === input.accountId && s.session_date.slice(0, 10) >= input.today)
    .sort((a, b) => a.session_date.localeCompare(b.session_date))[0]
  if (session) {
    const left = session.topics_left.filter((t) => t.trim()).slice(0, 5)
    next.push(`${sessionKindLabel(session.kind)} session on ${dayLabel(session.session_date)}${left.length ? `: ${left.join(', ')}` : ''}`)
  }
  const step = input.deals
    .filter((d) => d.account_id === input.accountId && d.stage !== 'lost' && d.next_action.trim() && d.next_action_date && d.next_action_date >= input.today)
    .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))[0]
  if (step) next.push(`${step.next_action.trim()} by ${dayLabel(step.next_action_date!)}`)
  return { fixed, open, next }
}

export const hasNews = (f: UpdateFacts) => f.fixed.length + f.open.length + f.next.length > 0

/** The facts as short lines, stored with the draft. */
export function factLines(f: UpdateFacts): string[] {
  return [...f.fixed.map((x) => `Fixed this week: ${x}`), ...f.open.map((x) => `Still open: ${x}`), ...f.next.map((x) => `Next: ${x}`)]
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || ''
const shortCompany = (companyName: string) =>
  companyName.replace(/\s+(Middle East\s+)?(FZE|FZ-LLC|LLC|Ltd)\.?$/i, '').trim() || 'Red Reach'

/** The draft text, built only from the facts. */
export function draftBody(input: { contactName: string; facts: UpdateFacts; companyName: string }): string {
  const f = input.facts
  const first = firstName(input.contactName)
  const list = (title: string, items: string[]) => (items.length ? ['', title, ...items.map((i) => `- ${i}`)] : [])
  return [
    first ? `Hi ${first},` : 'Hello,',
    '',
    "Here is this week's update on your CTRM Next work.",
    ...list('Fixed this week:', f.fixed),
    ...list('Still open:', f.open),
    ...list('Coming up:', f.next),
    '',
    'If anything here does not match what you see, just reply to this message.',
    '',
    'Kind regards,',
    `The ${shortCompany(input.companyName)} team`,
  ].join('\n')
}

/** Who the update goes to on each channel: the primary contact first. */
export function updateRecipients<C extends ReminderContact>(contacts: C[], countryCode = '971') {
  return {
    email: reminderRecipient(contacts, 'email', null, countryCode),
    whatsapp: reminderRecipient(contacts, 'whatsapp', null, countryCode),
  }
}

/** Why a draft cannot be sent, or null. */
export function sendProblem(input: { status: string; body: string; channel: string }): string | null {
  if (input.status === 'sent') return 'This update was already sent.'
  if (input.status === 'skipped') return 'This update was skipped. Put it back first.'
  const b = input.body.trim()
  if (b.length < 20) return 'Write the update first.'
  if (b.length > CLIENT_UPDATE_BODY_MAX) return `Keep the update under ${CLIENT_UPDATE_BODY_MAX} characters.`
  if (input.channel !== 'email' && input.channel !== 'whatsapp') return 'Pick email or WhatsApp.'
  return null
}

export function updateEmail(input: { accountName: string; weekStart: string; body: string }): { subject: string; body: string } {
  return {
    subject: `${input.accountName}: CTRM Next update, ${weekLabelOf(input.weekStart)}`,
    body: input.body.trim(),
  }
}

/** A wa.me link that opens WhatsApp with the update typed in, ready to send. */
export function whatsAppLink(phone: string, body: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(body.trim())}`
}

/** The line on the account timeline after sending. */
export function updateTimelineText(input: { weekStart: string; channel: ClientUpdateChannel; to: string; sentBy: string }): string {
  const how = input.channel === 'email' ? `email to ${input.to}` : `WhatsApp to ${input.to}`
  return `Weekly CTRM Next update (${weekLabelOf(input.weekStart)}) sent by ${how}, approved by ${input.sentBy}.`
}

