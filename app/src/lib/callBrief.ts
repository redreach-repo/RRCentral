/**
 * Before the call brief (Wave 4, PR S): one screen on any account with the
 * last contact, open tickets, open invoices, deal status and what is overdue,
 * plus three questions to ask suggested by AI help. Built from what RR
 * Central already holds; nothing is written unless a person saves the brief
 * as a note after reading it.
 */
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { invoiceDueDate } from './contractBilling'
import { stageLabel as ctrmStageLabel } from './ctrm'
import { isGoLive, isOverdue as goLiveOverdue } from './goLive'
import { salesStageLabel } from './salesPipeline'
import { TICKET_STATUSES, isOpenTicket } from './support'
import type { AccountActivity, BuildTask, CtrmDeal, Invoice, SalesDeal, Ticket } from './types'

export type BriefInput = {
  today: string
  activities: Pick<AccountActivity, 'kind' | 'body' | 'created_at' | 'user_email'>[]
  tickets: Pick<Ticket, 'subject' | 'status' | 'created_at' | 'sla_due_at' | 'first_response_at'>[]
  invoices: Pick<Invoice, 'reference_number' | 'date' | 'amount' | 'status' | 'payment_status' | 'payment_terms'>[]
  payments: { invoice_ref: string; amount: number }[]
  salesDeals: Pick<SalesDeal, 'stage' | 'next_action' | 'next_action_date' | 'monthly_fee'>[]
  ctrmDeals: Pick<CtrmDeal, 'stage' | 'next_action' | 'next_action_date'>[]
  goLive: Pick<BuildTask, 'title' | 'done' | 'kind' | 'due_date' | 'owner' | 'stage' | 'sort' | 'done_at'>[]
}

export type BriefInvoice = { reference: string; balance: number; due: string | null; daysLate: number }
export type Brief = {
  lastContact: { when: string; daysAgo: number; kind: string; by: string; summary: string } | null
  openTickets: { subject: string; status: string; opened: string; late: boolean }[]
  openInvoices: BriefInvoice[]
  owed: number
  deals: { pipeline: string; stage: string; nextAction: string; nextDate: string | null; late: boolean }[]
  overdue: string[]
}

const KIND_LABEL: Record<string, string> = { note: 'Note', call: 'Call', email: 'Email', meeting: 'Meeting' }
const short = (s: string, n: number) => {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > n ? `${flat.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : flat
}
const day = (iso: string) => format(parseISO(iso.slice(0, 10)), 'd MMM yyyy')
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const aed = (n: number) => `AED ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function buildBrief(input: BriefInput): Brief {
  const { today } = input
  const todayDate = parseISO(today)

  // Last contact: the newest call, email, meeting or note a person logged (not system lines).
  const contact = [...input.activities]
    .filter((a) => a.kind !== 'system')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const lastContact = contact
    ? {
        when: day(contact.created_at),
        daysAgo: Math.max(0, differenceInCalendarDays(todayDate, parseISO(contact.created_at.slice(0, 10)))),
        kind: KIND_LABEL[contact.kind] ?? contact.kind,
        by: contact.user_email,
        summary: short(contact.body, 240),
      }
    : null

  const ticketLabel = (s: string) => TICKET_STATUSES.find((o) => o.value === s)?.label ?? s
  const openTickets = input.tickets
    .filter(isOpenTicket)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((t) => ({
      subject: t.subject || 'No subject',
      status: ticketLabel(t.status),
      opened: day(t.created_at),
      late: !t.first_response_at && Boolean(t.sla_due_at) && String(t.sla_due_at).slice(0, 10) < today,
    }))

  const paid = new Map<string, number>()
  for (const p of input.payments) paid.set(p.invoice_ref, (paid.get(p.invoice_ref) ?? 0) + (Number(p.amount) || 0))
  const openInvoices = input.invoices
    .filter((i) => !['draft', 'cancelled'].includes(String(i.status).toLowerCase()) && String(i.payment_status).toLowerCase() !== 'paid')
    .map((i) => {
      const balance = round2(Math.max(0, Number(i.amount || 0) - (paid.get(i.reference_number) ?? 0)))
      const due = invoiceDueDate(i)
      return { reference: i.reference_number, balance, due, daysLate: due && due < today ? differenceInCalendarDays(todayDate, parseISO(due)) : 0 }
    })
    .filter((i) => i.balance > 0)
    .sort((a, b) => String(a.due || '').localeCompare(String(b.due || '')))
  const owed = round2(openInvoices.reduce((s, i) => s + i.balance, 0))

  const late = (d: string | null) => Boolean(d) && String(d) < today
  const deals = [
    ...input.salesDeals
      .filter((d) => d.stage !== 'lost')
      .map((d) => ({ pipeline: 'AI CRM', stage: salesStageLabel(d.stage), nextAction: d.next_action || '', nextDate: d.next_action_date, late: d.stage !== 'signed' && late(d.next_action_date) })),
    ...input.ctrmDeals
      .filter((d) => d.stage !== 'lost')
      .map((d) => ({ pipeline: 'CTRM Next', stage: ctrmStageLabel(d.stage), nextAction: d.next_action || '', nextDate: d.next_action_date, late: d.stage !== 'signed' && late(d.next_action_date) })),
  ]

  const overdue: string[] = [
    ...openInvoices.filter((i) => i.daysLate > 0).map((i) => `Invoice ${i.reference}: ${aed(i.balance)}, ${i.daysLate} days late`),
    ...openTickets.filter((t) => t.late).map((t) => `Ticket "${t.subject}" waiting for a first reply`),
    ...deals.filter((d) => d.late).map((d) => `${d.pipeline} next step "${d.nextAction || 'not set'}" was due ${day(String(d.nextDate))}`),
    ...input.goLive
      .filter((t) => isGoLive(t) && goLiveOverdue(t, today))
      .map((t) => `Go live step "${t.title}" (${t.owner === 'client' ? 'client' : 'Red Reach'}) was due ${day(String(t.due_date))}`),
  ]

  return { lastContact, openTickets, openInvoices, owed, deals, overdue }
}

/** The brief as short facts for the AI prompt (no amounts are invented: these are the only numbers it sees). */
export function briefFacts(b: Brief): string[] {
  const facts: string[] = []
  facts.push(
    b.lastContact
      ? `Last contact: ${b.lastContact.kind.toLowerCase()} ${b.lastContact.daysAgo} days ago (${b.lastContact.when}): ${b.lastContact.summary}`
      : 'No contact logged yet',
  )
  facts.push(b.openTickets.length ? `${b.openTickets.length} open tickets: ${b.openTickets.map((t) => `"${t.subject}" (${t.status})`).join(', ')}` : 'No open tickets')
  facts.push(
    b.openInvoices.length
      ? `${b.openInvoices.length} unpaid invoices, ${aed(b.owed)} owed in all`
      : 'No unpaid invoices',
  )
  for (const d of b.deals) {
    facts.push(`${d.pipeline} deal at ${d.stage}${d.nextAction ? `, next step: ${d.nextAction}` : ''}${d.nextDate ? ` (${day(d.nextDate)})` : ''}`)
  }
  if (b.overdue.length) facts.push(`Overdue: ${b.overdue.join('; ')}`)
  else facts.push('Nothing overdue')
  return facts.map((f) => short(f, 590))
}

/** The note saved on the timeline when someone keeps the brief. */
export function briefNote(b: Brief, questions: string[]): string {
  const lines = ['Before the call brief', ...briefFacts(b).map((f) => `- ${f}`)]
  if (questions.length) lines.push('', 'Questions to ask:', ...questions.map((q, i) => `${i + 1}. ${q}`))
  return lines.join('\n')
}
