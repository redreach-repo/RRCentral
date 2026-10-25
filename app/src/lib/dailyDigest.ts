/**
 * The daily digest: what needs attention today, sent each morning by email
 * and WhatsApp. Shared by the app (preview) and the daily-digest Edge
 * Function (bundled by app/scripts/build-support-function.mjs), so the
 * preview and the message never disagree. Only pure modules are imported.
 *
 * Four lists, the same rules as the dashboard:
 *  1. Tickets near or past their reply time (sla.ts).
 *  2. AI CRM contracts that renew in the next 60 days or have ended (delivery.ts).
 *  3. CTRM Next deals whose next action date has passed (ctrm.ts).
 *  4. AI CRM clients over their hours two months running (delivery.ts).
 * On Fridays it also names clients with no hours logged this week.
 * From the 07:30 watchdog (watchdog.ts) it adds stale deals and late invoices.
 * It also says how many contract invoices the 06:00 run drafted today,
 * and lists the new leads from the website, WhatsApp and the landing page.
 */
import { format, isFriday, parseISO } from 'date-fns'
import { isOverdue } from './ctrm'
import { newLeads, type IntakeRow } from './leadIntake'
import { currentContract, hoursAlert, renewalFlag, renewalLabel } from './delivery'
import { slaState } from './sla'
import { isOpenTicket } from './support'
import { clientsWithoutHoursThisWeek } from './timeTracking'
import { phoneDigits } from './usageImport'
import type { Account, Contract, CtrmDeal, DeliveryPackage, Ticket, TimeEntry } from './types'

export type DigestItem = {
  name: string
  detail: string
  /** App path, e.g. /accounts/<id>. */
  path: string
  urgent: boolean
}

export type Digest = {
  /** YYYY-MM-DD the digest is for. */
  date: string
  tickets: DigestItem[]
  renewals: DigestItem[]
  overdueActions: DigestItem[]
  overHours: DigestItem[]
  /** Fridays only: clients with no hours since Monday. Null on other days. */
  noHours: DigestItem[] | null
  /** App errors reported in the last 24 hours, one line per distinct message. */
  appErrors: DigestItem[]
  /** Open watchdog items: deals nobody has touched for a while. */
  staleDeals: DigestItem[]
  /** Open watchdog items: invoices 3, 7 or 14 days late. */
  lateInvoices: DigestItem[]
  /** Contract invoices drafted by today's run: one line while there are any to finalise. */
  contractDrafts: DigestItem[]
  /** Leads from the lead intake in the last 24 hours. */
  newLeads: DigestItem[]
}

/** An open watch_items row, as much as the digest needs. */
export type DigestWatchItem = {
  kind: string
  severity: string
  title: string
  reason: string
  link: string
  owner_label: string
}

export type DigestInput = {
  now: Date
  accounts: Pick<Account, 'id' | 'name' | 'type'>[]
  contracts: Contract[]
  packages: Pick<DeliveryPackage, 'id' | 'target_hours'>[]
  /** Time entries from at least the start of the month two months back. */
  entries: Pick<TimeEntry, 'account_id' | 'date' | 'hours'>[]
  tickets: Pick<Ticket, 'id' | 'subject' | 'account_id' | 'status' | 'created_at' | 'sla_due_at' | 'first_response_at'>[]
  deals: Pick<CtrmDeal, 'id' | 'account_id' | 'stage' | 'next_action' | 'next_action_date'>[]
  /** app_errors rows from the last 24 hours (optional). */
  errors?: { message: string; created_at: string }[]
  /** Open watch_items rows from the watchdog (optional). */
  watch?: DigestWatchItem[]
  /** Contract invoices drafted in the last 24 hours (optional). */
  contractDrafts?: number
  /** website_inquiries rows from the last 24 hours (optional). */
  leads?: IntakeRow[]
}

const day = (iso: string) => format(parseISO(iso.slice(0, 10)), 'd MMM')

export function buildDigest(input: DigestInput): Digest {
  const { now } = input
  const nameOf = new Map(input.accounts.map((a) => [a.id, a.name]))
  const clients = input.accounts.filter((a) => a.type === 'ai_crm_client').sort((a, b) => a.name.localeCompare(b.name))

  const tickets: DigestItem[] = input.tickets
    .filter(isOpenTicket)
    .map((t) => ({ t, state: slaState(t, now) }))
    .filter(({ state }) => state === 'breached' || state === 'warning')
    .sort((x, y) => String(x.t.sla_due_at).localeCompare(String(y.t.sla_due_at)))
    .map(({ t, state }) => ({
      name: t.subject || 'No subject',
      detail: `${t.account_id ? nameOf.get(t.account_id) ?? 'Account' : 'Unknown sender'}, ${
        state === 'breached' ? 'past its reply time' : 'reply due soon'
      }`,
      path: `/support/${t.id}`,
      urgent: state === 'breached',
    }))

  const renewals: { item: DigestItem; days: number }[] = []
  const overHours: DigestItem[] = []
  for (const a of clients) {
    const contracts = input.contracts.filter((c) => c.account_id === a.id)
    const contract = currentContract(contracts)
    const renewal = renewalFlag(contract, now)
    if (renewal) {
      renewals.push({
        days: renewal.days,
        item: {
          name: a.name,
          detail: `${renewalLabel(renewal).toLowerCase()} (${day(renewal.termEnd)})`,
          path: `/accounts/${a.id}`,
          urgent: renewal.kind === 'ended',
        },
      })
    }
    const pkg = input.packages.find((p) => p.id === contract?.package_id)
    if (pkg) {
      const alert = hoursAlert(
        input.entries.filter((e) => e.account_id === a.id),
        pkg.target_hours,
        now,
      )
      if (alert.flagged) {
        const [thisMonth, lastMonth] = alert.months
        overHours.push({
          name: a.name,
          detail: `${lastMonth.hours}h last month and ${thisMonth.hours}h so far this month, target ${pkg.target_hours}h`,
          path: `/accounts/${a.id}`,
          urgent: true,
        })
      }
    }
  }

  const overdueActions: DigestItem[] = input.deals
    .filter((d) => isOverdue(d, now))
    .sort((x, y) => String(x.next_action_date).localeCompare(String(y.next_action_date)))
    .map((d) => ({
      name: nameOf.get(d.account_id) ?? 'Prospect',
      detail: `${d.next_action || 'next action'}, due ${d.next_action_date ? day(d.next_action_date) : ''}`,
      path: `/accounts/${d.account_id}`,
      urgent: true,
    }))

  const noHours = isFriday(now)
    ? clientsWithoutHoursThisWeek({ accounts: input.accounts, contracts: input.contracts, entries: input.entries, today: now }).map(
        (a) => ({ name: a.name, detail: 'no hours logged since Monday', path: `/accounts/${a.id}`, urgent: false }),
      )
    : null

  return {
    date: format(now, 'yyyy-MM-dd'),
    tickets,
    renewals: renewals.sort((x, y) => x.days - y.days).map((r) => r.item),
    overdueActions,
    overHours,
    noHours,
    appErrors: digestErrors(input.errors || []),
    staleDeals: watchLines(input.watch || [], 'stale_deal'),
    lateInvoices: watchLines(input.watch || [], 'invoice_overdue'),
    contractDrafts: contractDraftItems(input.contractDrafts ?? 0),
    newLeads: newLeads(input.leads || [], new Date(now.getTime() - 24 * 60 * 60 * 1000)).map((l) => ({
      name: l.name,
      detail: l.detail,
      path: l.link,
      urgent: false,
    })),
  }
}

/** Watchdog items of one kind, urgent first, with the owner named. */
function watchLines(watch: DigestWatchItem[], kind: string): DigestItem[] {
  return watch
    .filter((w) => w.kind === kind)
    .sort((a, b) => (a.severity === b.severity ? a.title.localeCompare(b.title) : a.severity === 'urgent' ? -1 : 1))
    .map((w) => ({
      name: w.title,
      detail: w.owner_label ? `${w.reason} (${w.owner_label})` : w.reason,
      path: w.link || '/app',
      urgent: w.severity === 'urgent',
    }))
}

/** "N contract invoices drafted today", linking to Invoices to finalise them. */
export function contractDraftItems(n: number): DigestItem[] {
  if (!(n > 0)) return []
  return [
    {
      name: `${n} contract invoice${n === 1 ? '' : 's'} drafted today`,
      detail: `check and finalise ${n === 1 ? 'it' : 'them'} on Invoices to get the RR number`,
      path: '/invoices',
      urgent: false,
    },
  ]
}

/** One line per distinct error message, most frequent first, at most 5. */
function digestErrors(errors: { message: string }[]): DigestItem[] {
  const counts = new Map<string, number>()
  for (const e of errors) {
    const m = e.message.trim().slice(0, 140)
    if (m) counts.set(m, (counts.get(m) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([message, n]) => ({ name: message, detail: `${n} ${n === 1 ? 'time' : 'times'}`, path: '/app-errors', urgent: true }))
}

export type DigestSection = { key: keyof Omit<Digest, 'date'>; title: string; empty: string; items: DigestItem[] }

/** The sections in the order they are shown, Friday hours last. */
export function digestSections(d: Digest): DigestSection[] {
  const sections: DigestSection[] = [
    { key: 'tickets', title: 'Tickets near or past their reply time', empty: 'Every open ticket is on time.', items: d.tickets },
    { key: 'renewals', title: 'Renewals in the next 60 days', empty: 'No contract renews in the next 60 days.', items: d.renewals },
    { key: 'overdueActions', title: 'Overdue CTRM next actions', empty: 'No overdue next actions.', items: d.overdueActions },
    { key: 'overHours', title: 'Clients over their hours', empty: 'No client is over hours two months running.', items: d.overHours },
  ]
  if (d.newLeads?.length) {
    sections.push({ key: 'newLeads', title: 'New leads in the last day', empty: '', items: d.newLeads })
  }
  if (d.lateInvoices?.length) {
    sections.push({ key: 'lateInvoices', title: 'Invoices 3, 7 or 14 days late', empty: '', items: d.lateInvoices })
  }
  if (d.staleDeals?.length) {
    sections.push({ key: 'staleDeals', title: 'Deals nobody has touched', empty: '', items: d.staleDeals })
  }
  if (d.contractDrafts?.length) {
    sections.push({ key: 'contractDrafts', title: 'Contract invoices', empty: '', items: d.contractDrafts })
  }
  if (d.appErrors?.length) {
    sections.push({ key: 'appErrors', title: 'App errors in the last day', empty: '', items: d.appErrors })
  }
  if (d.noHours) {
    sections.push({ key: 'noHours', title: 'Friday check: no hours this week', empty: 'Every client has hours logged this week.', items: d.noHours })
  }
  return sections
}

export function digestCount(d: Digest): number {
  return digestSections(d).reduce((sum, s) => sum + s.items.length, 0)
}

export function digestDateLabel(d: Digest): string {
  return format(parseISO(d.date), 'EEEE d MMMM')
}

/** Plain text email. `appUrl` is the app's base, e.g. https://redreach-repo.github.io/RRCentral. */
export function digestEmail(d: Digest, appUrl: string): { subject: string; body: string } {
  const base = appUrl.replace(/\/$/, '')
  const count = digestCount(d)
  const subject =
    count === 0
      ? `RR Central digest for ${digestDateLabel(d)}: all clear`
      : `RR Central digest for ${digestDateLabel(d)}: ${count} ${count === 1 ? 'thing needs' : 'things need'} attention`
  const lines: string[] = [`Good morning. Here is what needs attention in RR Central today, ${digestDateLabel(d)}.`, '']
  for (const s of digestSections(d)) {
    lines.push(`${s.title} (${s.items.length})`)
    if (s.items.length === 0) lines.push(`  ${s.empty}`)
    for (const item of s.items) {
      lines.push(`  - ${item.name}: ${item.detail}`)
      lines.push(`    ${base}${item.path}`)
    }
    lines.push('')
  }
  lines.push(`Open the dashboard: ${base}/app`)
  lines.push('')
  lines.push('You get this because you are on the daily digest list in RR Central (Packages and rates).')
  return { subject, body: lines.join('\n') }
}

/**
 * Values for the WhatsApp template, in order. Meta does not allow new lines
 * in template values, so WhatsApp gets the counts and the email has the detail.
 * Template body (see docs/daily-digest.md):
 *   RR Central digest for {{1}}. Tickets near or past reply time: {{2}}.
 *   Renewals in the next 60 days: {{3}}. Overdue CTRM next actions: {{4}}.
 *   Clients over hours: {{5}}. Details are in your email and on the dashboard.
 */
export function digestWhatsAppValues(d: Digest): string[] {
  return [
    digestDateLabel(d),
    String(d.tickets.length),
    String(d.renewals.length),
    String(d.overdueActions.length),
    String(d.overHours.length),
  ]
}

export type DigestRecipient = {
  name: string
  email: string
  whatsapp_phone: string
  by_email: boolean
  by_whatsapp: boolean
  active: boolean
}

/** Who gets what: valid email addresses and WhatsApp numbers of active recipients, without repeats. */
export function digestTargets(recipients: DigestRecipient[]): { emails: string[]; phones: string[] } {
  const emails = new Set<string>()
  const phones = new Set<string>()
  for (const r of recipients) {
    if (!r.active) continue
    const email = String(r.email || '').trim().toLowerCase()
    if (r.by_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emails.add(email)
    const phone = phoneDigits(r.whatsapp_phone)
    if (r.by_whatsapp && phone.length >= 7) phones.add(phone)
  }
  return { emails: [...emails], phones: [...phones] }
}
