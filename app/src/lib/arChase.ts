/**
 * Overdue invoice chasing (HighMast improvement brief, fix 1).
 *
 * Pure rules shared by the app (Aging page, invoice chase log, dashboard) and
 * the AI connector (bundled into the highmast-mcp Edge Function through
 * highmastMcp.ts), so both show the same buckets, promises and next actions.
 *
 * Nothing here sends anything. A chase task carries a draft a person opens,
 * edits and sends themselves.
 *
 * Tables: ar_chase_settings, invoice_chase_log, invoice_chase_tasks
 * (supabase/migrations/20261328090000_ar_chase.sql).
 */
import { DIVISIONS } from './config'
import { invoiceDueDate, isCollectible } from './contractBilling'
import { formatMoneyAmount, roundMoney } from './currency'

// ---- Types ------------------------------------------------------------------

export const CHASE_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'visit', label: 'Visit' },
] as const
export type ChaseChannel = (typeof CHASE_CHANNELS)[number]['value']
export const CHASE_CHANNEL_VALUES = CHASE_CHANNELS.map((c) => c.value) as ChaseChannel[]

export function chaseChannelLabel(value: string): string {
  return CHASE_CHANNELS.find((c) => c.value === value)?.label || value
}

export type ChaseLogEntry = {
  id: string
  invoice_id: string
  chased_on: string
  channel: ChaseChannel
  contact: string
  note: string
  promised_date: string | null
  created_by_email: string
  source?: 'app' | 'ai'
  created_at: string
  deleted_at?: string | null
}

export type ChaseTaskStatus = 'open' | 'done' | 'skipped' | 'closed'
export type ChaseTaskKind = 'reminder' | 'escalate'

export type ChaseTask = {
  id: string
  invoice_id: string
  step_day: number
  kind: ChaseTaskKind
  due_on: string
  assigned_to: string | null
  status: ChaseTaskStatus
  outcome: string
  done_at: string | null
  done_by_email: string
  created_at?: string
}

export type ChaseSettings = {
  reminderDays: number[]
  escalateDays: number
  escalateToUserId: string | null
}

/** Reminders at 1, 7, 14 and 30 days overdue; escalate to the owner at 45. */
export const DEFAULT_CHASE_SETTINGS: ChaseSettings = { reminderDays: [1, 7, 14, 30], escalateDays: 45, escalateToUserId: null }

export type ChaseSettingsRow = {
  reminder_days?: number[] | null
  escalate_days?: number | null
  escalate_to_user_id?: string | null
}

const validDay = (d: unknown) => Number.isInteger(Number(d)) && Number(d) >= 1 && Number(d) <= 365

/** Settings from the database row, or the defaults when there is none or it is unusable. */
export function chaseSettingsFrom(row: ChaseSettingsRow | null | undefined): ChaseSettings {
  if (!row) return { ...DEFAULT_CHASE_SETTINGS, reminderDays: [...DEFAULT_CHASE_SETTINGS.reminderDays] }
  const days = [...new Set((row.reminder_days || []).map(Number).filter(validDay))].sort((a, b) => a - b)
  const esc = validDay(row.escalate_days) ? Number(row.escalate_days) : DEFAULT_CHASE_SETTINGS.escalateDays
  return {
    reminderDays: days.length ? days : [...DEFAULT_CHASE_SETTINGS.reminderDays],
    escalateDays: esc,
    escalateToUserId: row.escalate_to_user_id || null,
  }
}

/** "1, 7, 14, 30" typed by a person: days 1 to 365, at most 12, or an error. */
export function parseReminderDays(text: string): { days: number[] } | { error: string } {
  const parts = String(text || '')
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return { error: 'Add at least one reminder day.' }
  const days: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || !validDay(p)) return { error: `"${p}" is not a day between 1 and 365.` }
    days.push(Number(p))
  }
  const unique = [...new Set(days)].sort((a, b) => a - b)
  if (unique.length > 12) return { error: 'At most 12 reminder days.' }
  return { days: unique }
}

export type ChaseStep = { day: number; kind: ChaseTaskKind }

/** The schedule in day order. A reminder on the escalation day becomes the escalation. */
export function chaseSteps(settings: ChaseSettings): ChaseStep[] {
  const steps: ChaseStep[] = settings.reminderDays
    .filter((d) => d !== settings.escalateDays)
    .map((day) => ({ day, kind: 'reminder' as const }))
  steps.push({ day: settings.escalateDays, kind: 'escalate' })
  return steps.sort((a, b) => a.day - b.day)
}

// ---- Dates ------------------------------------------------------------------

const DAY_MS = 86_400_000

/** YYYY-MM-DD of a date in UTC (the same day the overdue counts use). */
export function isoDate(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10)
}

export function addDaysToIso(iso: string, days: number): string {
  return new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso.slice(0, 10) + 'T00:00:00Z') - Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z')) / DAY_MS) // money-guard: not money
}

// ---- Aging ------------------------------------------------------------------

export const AGING_BUCKETS = [
  { key: 'current', label: 'Current' },
  { key: '1-30', label: '1 to 30 days' },
  { key: '31-60', label: '31 to 60 days' },
  { key: '61-90', label: '61 to 90 days' },
  { key: '90+', label: 'Over 90 days' },
] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]['key']
export const AGING_BUCKET_KEYS = AGING_BUCKETS.map((b) => b.key) as AgingBucket[]

export function agingBucketLabel(key: string): string {
  return AGING_BUCKETS.find((b) => b.key === key)?.label || key
}

/** Bucket for days past due (0 or less, or no due date: current). */
export function agingBucket(daysOverdue: number | null | undefined): AgingBucket {
  const d = Number(daysOverdue)
  if (!Number.isFinite(d) || d <= 0) return 'current'
  if (d <= 30) return '1-30'
  if (d <= 60) return '31-60'
  if (d <= 90) return '61-90'
  return '90+'
}

/** Division code ('03') from the reference (RR-03-26102), else from the brand in `vertical`. */
export function invoiceDivision(inv: { reference_number?: string | null; vertical?: string | null }): string {
  const m = String(inv.reference_number || '').match(/^[A-Z]{2,4}-(\d{2})-/i)
  if (m) return m[1]
  const v = String(inv.vertical || '').trim().toLowerCase()
  return DIVISIONS.find((d) => d.brand.toLowerCase() === v)?.code || ''
}

export function divisionLabel(code: string): string {
  const d = DIVISIONS.find((x) => x.code === code)
  return d ? `${d.code} ${d.brand}` : code || 'No division'
}

export type AgingInvoice = {
  id: string
  client: string
  reference_number: string
  date: string | null
  amount: number
  currency?: string | null
  status: string
  payment_status: string
  payment_terms?: string | null
  vertical?: string | null
  account_id?: string | null
}

export type PromiseState = 'pending' | 'broken' | 'kept'
export type ChasePromise = { date: string; state: PromiseState; logged_on: string; contact: string }

/** Newest chase first: chase date, then when it was logged. */
export function sortChaseLog<T extends Pick<ChaseLogEntry, 'chased_on' | 'created_at'>>(log: T[]): T[] {
  return [...log].sort((a, b) => b.chased_on.localeCompare(a.chased_on) || String(b.created_at).localeCompare(String(a.created_at)))
}

/**
 * The promise that counts: the newest chase with a promised date. It is
 * broken when that date has passed (before today) and money is still owing.
 */
export function currentPromise(
  log: Pick<ChaseLogEntry, 'chased_on' | 'created_at' | 'promised_date' | 'contact' | 'deleted_at'>[],
  balance: number,
  todayIso: string,
): ChasePromise | null {
  const withPromise = sortChaseLog(log.filter((e) => e.promised_date && !e.deleted_at))
  const p = withPromise[0]
  if (!p || !p.promised_date) return null
  const date = p.promised_date.slice(0, 10)
  const state: PromiseState = balance <= 0.009 ? 'kept' : date < todayIso ? 'broken' : 'pending'
  return { date, state, logged_on: p.chased_on, contact: p.contact }
}

export type NextChaseAction = {
  kind: 'task' | 'promise_broken' | 'await_promise' | 'reminder' | 'escalate' | 'none'
  /** When to do it (YYYY-MM-DD); today or earlier means now. */
  due_on: string | null
  text: string
  task_id?: string
}

/**
 * What to do next on one invoice: a broken promise first, then an open task,
 * then waiting on a promise, then the next step of the schedule.
 */
export function nextChaseAction(input: {
  daysOverdue: number
  dueDate: string | null
  balance: number
  promise: ChasePromise | null
  tasks: Pick<ChaseTask, 'id' | 'step_day' | 'kind' | 'due_on' | 'status'>[]
  steps: ChaseStep[]
  todayIso: string
}): NextChaseAction {
  const { daysOverdue, dueDate, promise, todayIso } = input
  if (input.balance <= 0.009) return { kind: 'none', due_on: null, text: 'Nothing owing.' }
  if (promise?.state === 'broken') {
    return {
      kind: 'promise_broken',
      due_on: todayIso,
      text: `Promise to pay by ${promise.date} was broken: call ${promise.contact || 'the client'} today and agree a new date.`,
    }
  }
  const open = input.tasks.filter((t) => t.status === 'open').sort((a, b) => a.due_on.localeCompare(b.due_on))
  if (open.length) {
    const t = open[0]
    return {
      kind: 'task',
      due_on: t.due_on,
      task_id: t.id,
      text: t.kind === 'escalate' ? `Escalate to the owner (day ${t.step_day} overdue).` : `Send the day ${t.step_day} reminder (draft ready).`,
    }
  }
  if (promise?.state === 'pending') {
    return {
      kind: 'await_promise',
      due_on: addDaysToIso(promise.date, 1),
      text: `Client promised payment by ${promise.date}. Check the bank on ${addDaysToIso(promise.date, 1)}.`,
    }
  }
  if (!dueDate) return { kind: 'none', due_on: null, text: 'No due date on this invoice.' }
  // A step was reached but has no task yet (or tasks are not set up): do it now.
  const reached = input.steps.filter((s) => s.day <= daysOverdue)
  const last = reached[reached.length - 1]
  if (last && !input.tasks.some((t) => t.step_day >= last.day)) {
    return {
      kind: last.kind,
      due_on: todayIso,
      text: last.kind === 'escalate' ? `Escalate to the owner now (day ${last.day} passed).` : `Send the day ${last.day} reminder now.`,
    }
  }
  const next = input.steps.find((s) => s.day > Math.max(0, daysOverdue))
  if (next) {
    const on = addDaysToIso(dueDate, next.day)
    return {
      kind: next.kind,
      due_on: on,
      text: next.kind === 'escalate' ? `Escalate to the owner on ${on} (day ${next.day}).` : `Day ${next.day} reminder on ${on}.`,
    }
  }
  return { kind: 'none', due_on: null, text: 'Every step is done. Agree a payment date or a plan with the client.' }
}

export type AgingRow = {
  invoice_id: string
  reference: string
  client: string
  account_id: string | null
  division: string
  currency: string
  amount: number
  balance: number
  due_date: string | null
  days_overdue: number
  bucket: AgingBucket
  last_chase: Pick<ChaseLogEntry, 'chased_on' | 'channel' | 'contact' | 'note'> | null
  chase_count: number
  promise: ChasePromise | null
  next_action: NextChaseAction
}

const round2 = (n: number) => roundMoney(n)

/**
 * One row per unpaid invoice that has gone out (drafts, cancelled and paid
 * invoices are left out), with what is still owing after logged payments.
 */
export function buildAgingRows(input: {
  invoices: AgingInvoice[]
  /** Payments logged per invoice reference. */
  paid: Map<string, number>
  log: ChaseLogEntry[]
  tasks: ChaseTask[]
  settings: ChaseSettings
  today: Date
}): AgingRow[] {
  const todayIso = isoDate(input.today)
  const steps = chaseSteps(input.settings)
  const logBy = groupBy(input.log.filter((e) => !e.deleted_at), (e) => e.invoice_id)
  const tasksBy = groupBy(input.tasks, (t) => t.invoice_id)
  const rows: AgingRow[] = []
  for (const inv of input.invoices) {
    if (!isCollectible(inv)) continue
    const ref = String(inv.reference_number || '').trim()
    const balance = round2(Math.max(0, (Number(inv.amount) || 0) - (input.paid.get(ref) ?? 0)))
    if (balance <= 0.009) continue
    const due = invoiceDueDate({ date: inv.date, payment_terms: inv.payment_terms ?? '' })
    const days = due ? daysBetween(due, todayIso) : 0
    const log = sortChaseLog(logBy.get(inv.id) || [])
    const promise = currentPromise(log, balance, todayIso)
    rows.push({
      invoice_id: inv.id,
      reference: ref,
      client: String(inv.client || '').trim() || 'No client',
      account_id: inv.account_id || null,
      division: invoiceDivision(inv),
      currency: String(inv.currency || 'AED').toUpperCase(),
      amount: round2(Number(inv.amount) || 0),
      balance,
      due_date: due,
      days_overdue: Math.max(0, days),
      bucket: agingBucket(days),
      last_chase: log[0] ? { chased_on: log[0].chased_on, channel: log[0].channel, contact: log[0].contact, note: log[0].note } : null,
      chase_count: log.length,
      promise,
      next_action: nextChaseAction({
        daysOverdue: Math.max(0, days),
        dueDate: due,
        balance,
        promise,
        tasks: tasksBy.get(inv.id) || [],
        steps,
        todayIso,
      }),
    })
  }
  return rows.sort((a, b) => b.days_overdue - a.days_overdue || a.reference.localeCompare(b.reference))
}

function groupBy<T>(list: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of list) {
    const k = key(x)
    const arr = m.get(k)
    if (arr) arr.push(x)
    else m.set(k, [x])
  }
  return m
}

export type AgingTotals = Record<AgingBucket, number> & { total: number; overdue: number; count: number }

function emptyTotals(): AgingTotals {
  return { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0, overdue: 0, count: 0 }
}

/** Totals per currency (never added across currencies), each split by bucket. */
export function agingTotalsByCurrency(rows: AgingRow[]): Record<string, AgingTotals> {
  const out: Record<string, AgingTotals> = {}
  for (const r of rows) {
    const t = (out[r.currency] ||= emptyTotals())
    t[r.bucket] = round2(t[r.bucket] + r.balance)
    t.total = round2(t.total + r.balance)
    if (r.bucket !== 'current') t.overdue = round2(t.overdue + r.balance)
    t.count += 1
  }
  return out
}

export type AgingClientGroup = {
  client: string
  rows: AgingRow[]
  totals: Record<string, AgingTotals>
  oldest_days: number
}

/** Rows grouped by client, the client with the oldest debt first. */
export function groupAgingByClient(rows: AgingRow[]): AgingClientGroup[] {
  const groups = groupBy(rows, (r) => r.client.toLowerCase())
  return [...groups.values()]
    .map((list) => ({
      client: list[0].client,
      rows: list,
      totals: agingTotalsByCurrency(list),
      oldest_days: Math.max(...list.map((r) => r.days_overdue)),
    }))
    .sort((a, b) => b.oldest_days - a.oldest_days || a.client.localeCompare(b.client))
}

export type AgingSortKey = 'client' | 'reference' | 'due_date' | 'days_overdue' | 'balance' | 'last_chase' | 'next_action'

export function sortAgingRows(rows: AgingRow[], key: AgingSortKey, dir: 'asc' | 'desc'): AgingRow[] {
  const val = (r: AgingRow): string | number => {
    switch (key) {
      case 'client':
        return r.client.toLowerCase()
      case 'reference':
        return r.reference
      case 'due_date':
        return r.due_date || ''
      case 'days_overdue':
        return r.days_overdue
      case 'balance':
        return r.balance
      case 'last_chase':
        return r.last_chase?.chased_on || ''
      case 'next_action':
        return r.next_action.due_on || '9999-12-31'
    }
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return c * sign || a.reference.localeCompare(b.reference)
  })
}

export function filterAgingRows(rows: AgingRow[], f: { client?: string; division?: string; bucket?: string }): AgingRow[] {
  const client = (f.client || '').trim().toLowerCase()
  return rows.filter(
    (r) =>
      (!client || r.client.toLowerCase() === client || r.client.toLowerCase().includes(client)) &&
      (!f.division || r.division === f.division) &&
      (!f.bucket || r.bucket === f.bucket),
  )
}

// ---- Tasks ------------------------------------------------------------------

export type NewChaseTask = Pick<ChaseTask, 'invoice_id' | 'step_day' | 'kind' | 'due_on' | 'assigned_to'>

/**
 * Tasks to add now: for each overdue invoice, the latest step it has reached
 * that has no task yet. Earlier steps that were missed are not added late
 * (one reminder, not four at once). Nothing while a promise is still pending.
 */
export function planChaseTasks(input: {
  rows: AgingRow[]
  tasks: Pick<ChaseTask, 'invoice_id' | 'step_day'>[]
  settings: ChaseSettings
  ownerByAccount?: Map<string, string>
}): NewChaseTask[] {
  const steps = chaseSteps(input.settings)
  const have = new Set(input.tasks.map((t) => `${t.invoice_id}|${t.step_day}`))
  const haveAny = groupBy(input.tasks, (t) => t.invoice_id)
  const out: NewChaseTask[] = []
  for (const r of input.rows) {
    if (r.days_overdue < 1 || !r.due_date || r.promise?.state === 'pending') continue
    const reached = steps.filter((s) => s.day <= r.days_overdue)
    const step = reached[reached.length - 1]
    if (!step || have.has(`${r.invoice_id}|${step.day}`)) continue
    // A later step already exists (the schedule was shortened): do not go back.
    if ((haveAny.get(r.invoice_id) || []).some((t) => t.step_day > step.day)) continue
    out.push({
      invoice_id: r.invoice_id,
      step_day: step.day,
      kind: step.kind,
      due_on: addDaysToIso(r.due_date, step.day),
      assigned_to:
        step.kind === 'escalate'
          ? input.settings.escalateToUserId
          : (r.account_id && input.ownerByAccount?.get(r.account_id)) || null,
    })
  }
  return out
}

/** Open tasks on invoices that are now paid (or gone): close them. */
export function tasksToClose(tasks: Pick<ChaseTask, 'id' | 'invoice_id' | 'status'>[], rows: AgingRow[]): string[] {
  const owing = new Set(rows.map((r) => r.invoice_id))
  return tasks.filter((t) => t.status === 'open' && !owing.has(t.invoice_id)).map((t) => t.id)
}

// ---- Drafts (a person sends them) --------------------------------------------

export function chaseDraft(input: {
  kind: ChaseTaskKind
  stepDay: number
  reference: string
  client: string
  contactName: string
  balance: number
  currency: string
  dueDate: string | null
  daysOverdue: number
  companyName: string
  promise?: ChasePromise | null
}): { subject: string; body: string; whatsapp: string } {
  const amount = formatMoneyAmount(input.balance, input.currency || 'AED')
  const hello = `Dear ${input.contactName || `${input.client} accounts team`},`
  const due = input.dueDate ? ` was due on ${input.dueDate} and` : ''
  const broken = input.promise?.state === 'broken' ? ` We had noted payment by ${input.promise.date}, but have not received it yet.` : ''
  if (input.kind === 'escalate') {
    return {
      subject: `Overdue invoice ${input.reference}: ${amount} now ${input.daysOverdue} days late`,
      body: [
        hello,
        '',
        `Invoice ${input.reference} for ${amount}${due} is now ${input.daysOverdue} days overdue.${broken}`,
        'Our management has asked us to settle this with you directly. Please confirm today when the payment will be made, or call us to agree a plan.',
        '',
        'Kind regards,',
        input.companyName,
      ].join('\n'),
      whatsapp: `${hello} invoice ${input.reference} for ${amount} is ${input.daysOverdue} days overdue.${broken} Please confirm today when it will be paid. ${input.companyName}`,
    }
  }
  const tone =
    input.stepDay <= 3
      ? 'This is a friendly reminder that'
      : input.stepDay <= 14
        ? 'We have not yet received payment and'
        : 'Payment is still outstanding and'
  return {
    subject: `Payment reminder: invoice ${input.reference} (${amount})`,
    body: [
      hello,
      '',
      `${tone} invoice ${input.reference} for ${amount}${due} is ${input.daysOverdue} day${input.daysOverdue === 1 ? '' : 's'} overdue.${broken}`,
      'Please arrange payment or let us know the date it will be made. If it has already been paid, please send us the remittance so we can update our records.',
      '',
      'Kind regards,',
      input.companyName,
    ].join('\n'),
    whatsapp: `${hello} ${tone.toLowerCase()} invoice ${input.reference} for ${amount} is ${input.daysOverdue} days overdue.${broken} Please let us know when it will be paid. ${input.companyName}`,
  }
}

// ---- AI connector summary --------------------------------------------------------

/** Aging block for dashboard_summary and list_invoice_aging. */
export function agingSummary(rows: AgingRow[], max = 20) {
  const overdue = rows.filter((r) => r.days_overdue > 0)
  return {
    totals_by_currency: agingTotalsByCurrency(rows),
    broken_promises: overdue
      .filter((r) => r.promise?.state === 'broken')
      .slice(0, max)
      .map((r) => ({ invoice_id: r.invoice_id, reference: r.reference, client: r.client, balance: r.balance, currency: r.currency, promised_date: r.promise!.date })),
    next_chase_actions: overdue.slice(0, max).map((r) => ({
      invoice_id: r.invoice_id,
      reference: r.reference,
      client: r.client,
      balance: r.balance,
      currency: r.currency,
      days_overdue: r.days_overdue,
      bucket: r.bucket,
      next_action: r.next_action.text,
      next_action_due: r.next_action.due_on,
    })),
  }
}
