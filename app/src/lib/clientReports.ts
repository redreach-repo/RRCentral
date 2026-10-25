/**
 * Monthly client reports (Wave 4, PR Q). On the 1st the client-reports Edge
 * Function builds each AI CRM client's report for the month just ended and
 * drafts the summary with AI into an Approve queue. Nothing is sent until a
 * person checks the draft and presses Send, which emails it and sends it on
 * WhatsApp (a Meta template) to the account's primary contact.
 *
 * The same report numbers as the client portal and the report page
 * (buildPortalView), and the same AI prompt as "Write summary with AI".
 * Bundled into supabase/functions/client-reports.
 */
import { addMonths, format, parseISO, startOfMonth } from 'date-fns'
import { reportFacts } from './aiAssist'
import type { PortalView } from './clientPortal'
import { reminderRecipient, type ReminderContact } from './paymentReminder'

export type ClientReportStatus = 'draft' | 'sent' | 'skipped'
export type ClientReportChannel = 'email' | 'whatsapp'

export const CLIENT_REPORT_STATUSES: { value: ClientReportStatus; label: string }[] = [
  { value: 'draft', label: 'Waiting for approval' },
  { value: 'sent', label: 'Sent' },
  { value: 'skipped', label: 'Skipped' },
]

/** The month a run on `today` reports on: the one just ended, `YYYY-MM-01`. */
export function reportMonthFor(today: Date): string {
  return format(addMonths(startOfMonth(today), -1), 'yyyy-MM-01')
}

export const monthLabelOf = (month: string) => format(parseISO(month.slice(0, 10)), 'MMMM yyyy')

export type ReportAccount = { id: string; name: string; type: string; status?: string | null }
export type ReportContract = { account_id: string; status: string; term_start: string | null; term_end: string | null }

/**
 * AI CRM clients with an active contract running in `month` that have no
 * report draft for it yet.
 */
export function reportCandidates(input: {
  accounts: ReportAccount[]
  contracts: ReportContract[]
  existing: { account_id: string; month: string }[]
  month: string
}): ReportAccount[] {
  const monthStart = input.month.slice(0, 10)
  const monthEnd = format(addMonths(parseISO(monthStart), 1), 'yyyy-MM-01')
  const done = new Set(input.existing.filter((e) => e.month.slice(0, 10) === monthStart).map((e) => e.account_id))
  const running = new Set(
    input.contracts
      .filter((c) => c.status === 'active')
      .filter((c) => !c.term_start || c.term_start < monthEnd)
      .filter((c) => !c.term_end || c.term_end >= monthStart)
      .map((c) => c.account_id),
  )
  return input.accounts
    .filter((a) => a.type === 'ai_crm_client' && a.status !== 'archived' && running.has(a.id) && !done.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The report numbers as short facts, for the AI prompt and the message. */
export function factsForReport(view: PortalView): string[] {
  const r = view.report
  return reportFacts({
    hours: r.hours,
    targetHours: r.targetHours,
    hoursByWork: r.hoursByWork,
    ticketsResolved: r.ticketsResolved.length,
    ticketsOpened: r.ticketsOpened,
    answered: r.answered,
    answeredOnTime: r.answeredOnTime,
    whatsappUsed: r.usage ? r.usage.whatsappUsed : null,
    whatsappIncluded: r.usage && r.usage.whatsappIncluded ? r.usage.whatsappIncluded : null,
    aboveAed: r.usage ? r.usage.aboveAed : null,
    buildDone: view.build.done,
    buildTotal: view.build.total,
    buildCurrent: view.build.current,
    comingNext: r.comingNext,
  })
}

/** Who the report goes to on each channel: the primary contact first. */
export function reportRecipients<C extends ReminderContact>(contacts: C[], countryCode = '971') {
  return {
    email: reminderRecipient(contacts, 'email', null, countryCode),
    whatsapp: reminderRecipient(contacts, 'whatsapp', null, countryCode),
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || ''
const shortCompany = (companyName: string) =>
  companyName.replace(/\s+(Middle East\s+)?(FZE|FZ-LLC|LLC|Ltd)\.?$/i, '').trim() || 'Red Reach'

export const CLIENT_REPORT_SUMMARY_MAX = 3000

/** Why a draft cannot be sent, or null. */
export function sendProblem(input: { status: string; summary: string; channels: string[] }): string | null {
  if (input.status === 'sent') return 'This report was already sent.'
  if (input.status === 'skipped') return 'This report was skipped. Put it back first.'
  const s = input.summary.trim()
  if (s.length < 20) return 'Write the summary first (or check the AI draft).'
  if (s.length > CLIENT_REPORT_SUMMARY_MAX) return `Keep the summary under ${CLIENT_REPORT_SUMMARY_MAX} characters.`
  if (!input.channels.length) return 'Pick email, WhatsApp or both.'
  if (input.channels.some((c) => c !== 'email' && c !== 'whatsapp')) return 'Unknown channel.'
  return null
}

/** The email: the approved summary, then the numbers exactly as in the report. */
export function reportEmail(input: {
  contactName: string
  accountName: string
  month: string
  summary: string
  facts: string[]
  companyName: string
  senderName: string
}): { subject: string; body: string } {
  const company = shortCompany(input.companyName)
  const first = firstName(input.contactName)
  const sender = firstName(input.senderName)
  const lines = [
    first ? `Hi ${first},` : 'Hello,',
    '',
    input.summary.trim(),
    '',
    `${monthLabelOf(input.month)} in numbers:`,
    ...input.facts.map((f) => `- ${f}`),
    '',
    'The full report, with your usage and open requests, is in your client portal.',
    '',
    'Kind regards,',
    sender ? `${sender}, ${company}` : company,
  ]
  return { subject: `${input.accountName}: your ${monthLabelOf(input.month)} report from ${company}`, body: lines.join('\n') }
}

/**
 * Values for the WhatsApp template `rr_monthly_report` (docs/client-reports.md),
 * in order: first name, month, summary. Template values may not hold line
 * breaks or more than four spaces in a row, and stay under 1000 characters.
 */
export function reportWhatsAppValues(input: { contactName: string; month: string; summary: string }): string[] {
  const flat = input.summary.replace(/\s+/g, ' ').trim()
  const summary = flat.length > 900 ? `${flat.slice(0, 897).replace(/\s+\S*$/, '')}...` : flat
  return [firstName(input.contactName) || 'there', monthLabelOf(input.month), summary]
}

/** The line on the account timeline after sending. */
export function reportTimelineText(input: { month: string; sent: { channel: ClientReportChannel; to: string }[]; failed: string[]; sentBy: string }): string {
  const how = input.sent.map((s) => `${s.channel === 'email' ? 'email' : 'WhatsApp'} to ${s.to}`).join(' and ')
  return (
    `${monthLabelOf(input.month)} report sent by ${how}, approved by ${input.sentBy}.` +
    (input.failed.length ? ` Not sent: ${input.failed.join('; ')}.` : '')
  )
}

// For the Edge Function.
export { buildPortalView, ratesFromSettings, DELIVERY_RATE_KEYS } from './clientPortal'
export { AI_MODEL, aiCostUsd, buildAiRequest, tidyAiText } from './aiAssist'
