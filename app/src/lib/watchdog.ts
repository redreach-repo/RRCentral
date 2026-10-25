import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { dueReminder, invoiceDueDate, isCollectible } from './contractBilling'
import { isOpenDeal } from './ctrm'
import { currentContract, hoursAlert, renewalFlag } from './delivery'
import { isOpenSalesDeal } from './salesPipeline'
import { slaState } from './sla'
import { isOpenTicket } from './support'
import type { Account, AppUser, Contract, CrmEntry, CtrmDeal, DeliveryPackage, Invoice, SalesDeal, Ticket, TimeEntry } from './types'

/**
 * The daily watchdog: one list of what has slipped, each item with an owner,
 * a reason and a link. Shared by the app and the watchdog Edge Function
 * (bundled by app/scripts/build-support-function.mjs). Only pure modules are
 * imported.
 *
 * The function saves the list in watch_items each morning. Every item has a
 * stable key, so an item seen again keeps its first-seen time, and an item
 * not found any more is cleared: fixing the cause clears it the next morning.
 */

export type WatchKind =
  | 'stale_deal'
  | 'invoice_overdue'
  | 'ticket_sla'
  | 'over_hours'
  | 'renewal'
  | 'contract_expired'

export type WatchSeverity = 'warning' | 'urgent'

export type WatchItem = {
  /** Stable while the cause lasts, e.g. `invoice_overdue:<id>`. */
  key: string
  kind: WatchKind
  severity: WatchSeverity
  /** What it is about: the account, deal or ticket. */
  title: string
  /** Why it is on the list, in a few words. */
  reason: string
  /** App path, e.g. /accounts/<id>. */
  link: string
  owner_user_id: string | null
  /** The owner's name, or the CRM owner text when there is no team login for it. */
  owner_label: string
  account_id: string | null
}

export const WATCH_KIND_LABELS: Record<WatchKind, string> = {
  stale_deal: 'Stale deal',
  invoice_overdue: 'Invoice overdue',
  ticket_sla: 'Ticket reply time',
  over_hours: 'Over hours',
  renewal: 'Renewal due',
  contract_expired: 'Contract past its end date',
}

/** Days without a touch before an open deal counts as stale, per pipeline. Editable on Packages and rates. */
export const STALE_DAY_KEYS = {
  crm: 'watchStaleDaysCrm',
  sales: 'watchStaleDaysSales',
  ctrm: 'watchStaleDaysCtrm',
} as const
export const DEFAULT_STALE_DAYS = { crm: 21, sales: 14, ctrm: 14 }
export type Pipeline = keyof typeof DEFAULT_STALE_DAYS

/** Renewals within this many days are on the list. */
export const WATCH_RENEWAL_DAYS = 30

export function staleDays(settings: Record<string, string | undefined>): Record<Pipeline, number> {
  const out = { ...DEFAULT_STALE_DAYS }
  for (const p of Object.keys(out) as Pipeline[]) {
    const n = Number(settings[STALE_DAY_KEYS[p]])
    if (Number.isInteger(n) && n >= 1 && n <= 365) out[p] = n
  }
  return out
}

export type WatchInput = {
  now: Date
  settings: Record<string, string | undefined>
  users: Pick<AppUser, 'id' | 'email' | 'name'>[]
  accounts: Pick<Account, 'id' | 'name' | 'type' | 'owner_user_id'>[]
  crm: Pick<CrmEntry, 'id' | 'company_name' | 'owner' | 'pipeline_stage' | 'updated_at'>[]
  salesDeals: Pick<SalesDeal, 'id' | 'account_id' | 'stage' | 'owner_user_id' | 'last_touch_at'>[]
  ctrmDeals: Pick<CtrmDeal, 'id' | 'account_id' | 'stage' | 'owner_user_id' | 'last_touch_at'>[]
  invoices: Pick<
    Invoice,
    'id' | 'account_id' | 'client' | 'reference_number' | 'date' | 'payment_terms' | 'status' | 'payment_status' | 'amount'
  >[]
  /** Paid so far per invoice reference (payment_log). */
  paid: Map<string, number>
  tickets: Pick<
    Ticket,
    'id' | 'subject' | 'account_id' | 'status' | 'assignee_user_id' | 'created_at' | 'sla_due_at' | 'first_response_at'
  >[]
  contracts: Contract[]
  packages: Pick<DeliveryPackage, 'id' | 'target_hours'>[]
  /** Time entries from at least the start of the month two months back. */
  entries: Pick<TimeEntry, 'account_id' | 'date' | 'hours'>[]
}

const day = (iso: string) => format(parseISO(iso.slice(0, 10)), 'd MMM')
const daysSince = (iso: string, now: Date) => differenceInCalendarDays(now, parseISO(iso))
const OPEN_CRM = (stage: string) => stage !== 'Won' && stage !== 'Lost'

export function watchItems(input: WatchInput): WatchItem[] {
  const { now } = input
  const stale = staleDays(input.settings)
  const userName = new Map(input.users.map((u) => [u.id, u.name || u.email]))
  const account = new Map(input.accounts.map((a) => [a.id, a]))
  const owner = (userId: string | null | undefined) => ({
    owner_user_id: userId && userName.has(userId) ? userId : null,
    owner_label: (userId && userName.get(userId)) || '',
  })
  const accountOwner = (accountId: string | null | undefined) => owner(accountId ? account.get(accountId)?.owner_user_id : null)
  const nameOf = (accountId: string | null | undefined, fallback: string) =>
    (accountId ? account.get(accountId)?.name : '') || fallback
  const items: WatchItem[] = []

  // 1. Stale deals, per pipeline.
  for (const d of input.crm) {
    if (!OPEN_CRM(d.pipeline_stage) || !d.updated_at) continue
    const days = daysSince(d.updated_at, now)
    if (days < stale.crm) continue
    const login = input.users.find((u) => u.name && u.name.toLowerCase() === String(d.owner || '').trim().toLowerCase())
    items.push({
      key: `stale_deal:crm:${d.id}`,
      kind: 'stale_deal',
      severity: days >= stale.crm * 2 ? 'urgent' : 'warning',
      title: d.company_name || 'CRM lead',
      reason: `CRM ${d.pipeline_stage || 'lead'}, no update for ${days} days`,
      link: `/crm?edit=${d.id}`,
      owner_user_id: login?.id ?? null,
      owner_label: login ? login.name : String(d.owner || ''),
      account_id: null,
    })
  }
  for (const d of input.salesDeals) {
    if (!isOpenSalesDeal(d) || !d.last_touch_at) continue
    const days = daysSince(d.last_touch_at, now)
    if (days < stale.sales) continue
    items.push({
      key: `stale_deal:sales:${d.id}`,
      kind: 'stale_deal',
      severity: days >= stale.sales * 2 ? 'urgent' : 'warning',
      title: nameOf(d.account_id, 'AI CRM prospect'),
      reason: `AI CRM sales, no touch for ${days} days`,
      link: `/accounts/${d.account_id}`,
      ...owner(d.owner_user_id),
      account_id: d.account_id,
    })
  }
  for (const d of input.ctrmDeals) {
    if (!isOpenDeal(d) || !d.last_touch_at) continue
    const days = daysSince(d.last_touch_at, now)
    if (days < stale.ctrm) continue
    items.push({
      key: `stale_deal:ctrm:${d.id}`,
      kind: 'stale_deal',
      severity: days >= stale.ctrm * 2 ? 'urgent' : 'warning',
      title: nameOf(d.account_id, 'CTRM prospect'),
      reason: `CTRM Next, no touch for ${days} days`,
      link: `/accounts/${d.account_id}`,
      ...owner(d.owner_user_id),
      account_id: d.account_id,
    })
  }

  // 2. Invoices overdue 3, 7 and 14 days (the payment reminder stages).
  for (const inv of input.invoices) {
    if (!isCollectible(inv)) continue
    const balance = Math.round((Number(inv.amount) - (input.paid.get(inv.reference_number) ?? 0)) * 100) / 100
    const late = dueReminder(inv, balance, [], now)
    if (!late) continue
    items.push({
      key: `invoice_overdue:${inv.id}`,
      kind: 'invoice_overdue',
      severity: late.stage === 14 ? 'urgent' : 'warning',
      title: nameOf(inv.account_id, inv.client || inv.reference_number),
      reason: `${inv.reference_number}, ${balance.toFixed(2)} AED, ${late.daysLate} days late (due ${day(invoiceDueDate(inv) || late.dueDate)})`,
      link: '/invoices',
      ...accountOwner(inv.account_id),
      account_id: inv.account_id ?? null,
    })
  }

  // 3. Tickets near or past their reply time.
  for (const t of input.tickets) {
    if (!isOpenTicket(t)) continue
    const state = slaState(t, now)
    if (state !== 'breached' && state !== 'warning') continue
    items.push({
      key: `ticket_sla:${t.id}`,
      kind: 'ticket_sla',
      severity: state === 'breached' ? 'urgent' : 'warning',
      title: t.subject || 'No subject',
      reason: `${nameOf(t.account_id, 'Unknown sender')}, ${state === 'breached' ? 'past its reply time' : 'reply due soon'}`,
      link: `/support/${t.id}`,
      ...(t.assignee_user_id ? owner(t.assignee_user_id) : accountOwner(t.account_id)),
      account_id: t.account_id,
    })
  }

  // 4 to 6. AI CRM clients: over hours, renewing within 30 days, past their end date.
  for (const a of input.accounts.filter((x) => x.type === 'ai_crm_client')) {
    const contract = currentContract(input.contracts.filter((c) => c.account_id === a.id))
    const pkg = input.packages.find((p) => p.id === contract?.package_id)
    if (pkg) {
      const alert = hoursAlert(
        input.entries.filter((e) => e.account_id === a.id),
        pkg.target_hours,
        now,
      )
      if (alert.flagged) {
        const [thisMonth, lastMonth] = alert.months
        items.push({
          key: `over_hours:${a.id}`,
          kind: 'over_hours',
          severity: 'urgent',
          title: a.name,
          reason: `${lastMonth.hours}h last month and ${thisMonth.hours}h so far this month, target ${pkg.target_hours}h`,
          link: `/accounts/${a.id}`,
          ...owner(a.owner_user_id),
          account_id: a.id,
        })
      }
    }
    const renewal = renewalFlag(contract, now)
    if (renewal?.kind === 'ended') {
      items.push({
        key: `contract_expired:${contract!.id}`,
        kind: 'contract_expired',
        severity: 'urgent',
        title: a.name,
        reason: `term ended ${day(renewal.termEnd)} and the contract is still active: renew it or mark it ended`,
        link: `/accounts/${a.id}`,
        ...owner(a.owner_user_id),
        account_id: a.id,
      })
    } else if (renewal && renewal.days <= WATCH_RENEWAL_DAYS) {
      items.push({
        key: `renewal:${contract!.id}`,
        kind: 'renewal',
        severity: renewal.days <= 7 ? 'urgent' : 'warning',
        title: a.name,
        reason: renewal.days === 0 ? 'term ends today' : `renews in ${renewal.days} days (${day(renewal.termEnd)})`,
        link: `/accounts/${a.id}`,
        ...owner(a.owner_user_id),
        account_id: a.id,
      })
    }
  }

  const order: WatchKind[] = ['ticket_sla', 'invoice_overdue', 'contract_expired', 'renewal', 'over_hours', 'stale_deal']
  return items.sort(
    (x, y) =>
      (x.severity === y.severity ? 0 : x.severity === 'urgent' ? -1 : 1) ||
      order.indexOf(x.kind) - order.indexOf(y.kind) ||
      x.title.localeCompare(y.title),
  )
}

/** A saved watch_items row. */
export type WatchRow = WatchItem & { id: string; first_seen_at: string; last_seen_at: string; cleared_at: string | null }

/** Open items for one person: theirs first, then the ones nobody owns. */
export function itemsFor(rows: WatchRow[], userId: string | null, mineOnly: boolean): WatchRow[] {
  const open = rows.filter((r) => !r.cleared_at)
  if (!mineOnly) return open
  return open.filter((r) => r.owner_user_id === userId || !r.owner_user_id)
}
