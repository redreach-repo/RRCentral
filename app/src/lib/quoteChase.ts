/**
 * Quote follow-up chasing (Alfred 2026-11-28, "Quote and invoice chasing").
 *
 * The invoice side (arChase.ts) chases money that is owed. This chases quotes
 * that went out and have no answer yet: how long each has waited, every
 * follow-up with the client's answer and any agreed call-back date, the
 * schedule (follow up 3, 7 and 14 days after sending, a reminder before the
 * quote expires, escalate to the owner at 21 days), and the next thing to do.
 * It also catches quotes that need a person's decision: the client accepted,
 * a client PO arrived but the quote is not Awarded yet, or the quote expired
 * in the last 7 days (revise, extend or close it instead of letting it go
 * quietly).
 *
 * Pure rules shared by the app (Quote follow-up page, follow-up log,
 * dashboard) and the AI connector (bundled into the highmast-mcp Edge
 * Function through highmastMcp.ts). Nothing here sends anything, and nothing
 * here changes a quote: a task carries a draft that a person opens, edits and
 * sends, and status changes (Awarded, Not awarded, revise) stay buttons a
 * person presses on the quote.
 *
 * Tables: quote_chase_settings, quote_chase_log, quote_chase_tasks
 * (supabase/migrations/20261334090000_quote_chase.sql).
 */
import { DIVISIONS } from './config'
import { formatMoneyAmount, roundMoney } from './currency'
import { addDaysToIso, CHASE_CHANNEL_VALUES, chaseChannelLabel, CHASE_CHANNELS, isoDate, type ChaseChannel } from './arChase'

export { CHASE_CHANNELS, CHASE_CHANNEL_VALUES, chaseChannelLabel, isoDate, addDaysToIso }
export type { ChaseChannel }

// ---- Types ------------------------------------------------------------------

export const QUOTE_RESPONSES = [
  { value: 'no_reply', label: 'No reply' },
  { value: 'interested', label: 'Interested' },
  { value: 'needs_changes', label: 'Wants changes' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'declined', label: 'Declined' },
] as const
export type QuoteResponse = (typeof QUOTE_RESPONSES)[number]['value']
export const QUOTE_RESPONSE_VALUES = QUOTE_RESPONSES.map((r) => r.value) as QuoteResponse[]

export function quoteResponseLabel(value: string | null | undefined): string {
  return QUOTE_RESPONSES.find((r) => r.value === value)?.label || ''
}

export type QuoteChaseEntry = {
  id: string
  quotation_id: string
  chased_on: string
  channel: ChaseChannel
  contact: string
  note: string
  /** '' when not recorded. */
  response: QuoteResponse | ''
  /** Agreed date to follow up again. */
  next_follow_up: string | null
  created_by_email: string
  source?: 'app' | 'ai'
  created_at: string
  deleted_at?: string | null
}

export type QuoteTaskKind = 'followup' | 'expiry' | 'escalate'
export type QuoteTaskStatus = 'open' | 'done' | 'skipped' | 'closed'

export type QuoteChaseTask = {
  id: string
  quotation_id: string
  /** followup / escalate: days after sending. expiry: days before valid_until. */
  step_day: number
  kind: QuoteTaskKind
  due_on: string
  assigned_to: string | null
  status: QuoteTaskStatus
  outcome: string
  done_at: string | null
  done_by_email: string
  created_at?: string
}

export type QuoteChaseSettings = {
  followupDays: number[]
  /** Reminder this many days before valid_until; 0 = none. */
  expiryWarnDays: number
  escalateDays: number
  escalateToUserId: string | null
}

/** Follow up 3, 7 and 14 days after sending, 3 days before expiry, escalate at 21. */
export const DEFAULT_QUOTE_CHASE_SETTINGS: QuoteChaseSettings = {
  followupDays: [3, 7, 14],
  expiryWarnDays: 3,
  escalateDays: 21,
  escalateToUserId: null,
}

/** An expired quote stays on the list this many days so someone decides what to do. */
export const EXPIRED_GRACE_DAYS = 7

export type QuoteChaseSettingsRow = {
  followup_days?: number[] | null
  expiry_warn_days?: number | null
  escalate_days?: number | null
  escalate_to_user_id?: string | null
}

const validDay = (d: unknown, min = 1, max = 180) => Number.isInteger(Number(d)) && Number(d) >= min && Number(d) <= max

export function quoteChaseSettingsFrom(row: QuoteChaseSettingsRow | null | undefined): QuoteChaseSettings {
  const d = DEFAULT_QUOTE_CHASE_SETTINGS
  if (!row) return { ...d, followupDays: [...d.followupDays] }
  const days = [...new Set((row.followup_days || []).map(Number).filter((x) => validDay(x)))].sort((a, b) => a - b)
  const hasWarn = row.expiry_warn_days !== null && row.expiry_warn_days !== undefined
  return {
    followupDays: days.length ? days : [...d.followupDays],
    expiryWarnDays: hasWarn && validDay(row.expiry_warn_days, 0, 60) ? Number(row.expiry_warn_days) : d.expiryWarnDays,
    escalateDays: validDay(row.escalate_days) ? Number(row.escalate_days) : d.escalateDays,
    escalateToUserId: row.escalate_to_user_id || null,
  }
}

/** "3, 7, 14" typed by a person: days 1 to 180, at most 12, or an error. */
export function parseFollowupDays(text: string): { days: number[] } | { error: string } {
  const parts = String(text || '')
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return { error: 'Add at least one follow-up day.' }
  const days: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || !validDay(p)) return { error: `"${p}" is not a day between 1 and 180.` }
    days.push(Number(p))
  }
  const unique = [...new Set(days)].sort((a, b) => a - b)
  if (unique.length > 12) return { error: 'At most 12 follow-up days.' }
  return { days: unique }
}

// ---- Dates ------------------------------------------------------------------

const DAY_MS = 86_400_000

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso.slice(0, 10) + 'T00:00:00Z') - Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z')) / DAY_MS) // money-guard: not money
}

const isIsoDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)

// ---- Steps ------------------------------------------------------------------

export type QuoteStep = { kind: QuoteTaskKind; step_day: number; due_on: string }

/**
 * The schedule of one quote, in date order: follow-ups after sending, the
 * reminder before expiry (only when that falls after the quote went out) and
 * the escalation. A follow-up on the escalation day becomes the escalation.
 */
export function quoteSteps(settings: QuoteChaseSettings, sentIso: string, validUntil: string | null): QuoteStep[] {
  const steps: QuoteStep[] = settings.followupDays
    .filter((d) => d !== settings.escalateDays)
    .map((d) => ({ kind: 'followup' as const, step_day: d, due_on: addDaysToIso(sentIso, d) }))
  steps.push({ kind: 'escalate', step_day: settings.escalateDays, due_on: addDaysToIso(sentIso, settings.escalateDays) })
  if (settings.expiryWarnDays > 0 && isIsoDay(validUntil)) {
    const due = addDaysToIso(validUntil, -settings.expiryWarnDays)
    if (due > sentIso.slice(0, 10)) steps.push({ kind: 'expiry', step_day: settings.expiryWarnDays, due_on: due })
  }
  const order: Record<QuoteTaskKind, number> = { followup: 0, expiry: 1, escalate: 2 }
  return steps.sort((a, b) => a.due_on.localeCompare(b.due_on) || order[a.kind] - order[b.kind])
}

/** A follow-up step is already done when someone followed up in the 2 days before it (or later). */
export function stepCovered(step: QuoteStep, lastContactIso: string | null): boolean {
  if (step.kind !== 'followup' || !lastContactIso) return false
  return lastContactIso.slice(0, 10) >= addDaysToIso(step.due_on, -2)
}

// ---- Rows -------------------------------------------------------------------

export type ChaseQuote = {
  id: string
  client: string
  reference_number: string
  division_code?: string | null
  amount: number
  quotation_currency?: string | null
  currency?: string | null
  status: string
  sent_at?: string | null
  followed_up_at?: string | null
  valid_until?: string | null
  date?: string | null
  created_at?: string | null
  account_id?: string | null
  created_by?: string | null
  deleted_at?: string | null
}

export type ChaseQuotePo = {
  quotation_id?: string | null
  quote_reference?: string | null
  po_number: string
  po_date?: string | null
}

export const WAIT_BUCKETS = [
  { key: '0-7', label: 'Up to 7 days' },
  { key: '8-14', label: '8 to 14 days' },
  { key: '15-30', label: '15 to 30 days' },
  { key: '31+', label: 'Over 30 days' },
] as const
export type WaitBucket = (typeof WAIT_BUCKETS)[number]['key']
export const WAIT_BUCKET_KEYS = WAIT_BUCKETS.map((b) => b.key) as WaitBucket[]

export function waitBucket(days: number): WaitBucket {
  if (!Number.isFinite(days) || days <= 7) return '0-7'
  if (days <= 14) return '8-14'
  if (days <= 30) return '15-30'
  return '31+'
}

export function waitBucketLabel(key: string): string {
  return WAIT_BUCKETS.find((b) => b.key === key)?.label || key
}

export type Validity = 'ok' | 'expiring' | 'expired' | 'none'

export type Callback = { date: string; state: 'pending' | 'missed'; contact: string }

export type QuoteNextAction = {
  kind: 'award' | 'expired' | 'callback_missed' | 'close' | 'task' | 'await_callback' | 'followup' | 'expiry' | 'escalate' | 'none'
  /** When to do it (YYYY-MM-DD); today or earlier means now. */
  due_on: string | null
  text: string
  task_id?: string
}

export type QuoteChaseRow = {
  quote_id: string
  reference: string
  client: string
  account_id: string | null
  created_by: string
  division: string
  currency: string
  amount: number
  status: string
  sent_on: string
  days_since_sent: number
  bucket: WaitBucket
  valid_until: string | null
  /** Negative once the quote has expired. Null without a validity date. */
  days_to_expiry: number | null
  validity: Validity
  last_chase: Pick<QuoteChaseEntry, 'chased_on' | 'channel' | 'contact' | 'note'> | null
  chase_count: number
  /** Latest follow-up of any kind (logged, or sent from the older 3-day nudge). */
  last_contact_on: string | null
  response: QuoteResponse | ''
  callback: Callback | null
  /** A client PO is linked to this quote but it is not Awarded yet. */
  po: { po_number: string; po_date: string | null } | null
  next_action: QuoteNextAction
}

/** Newest follow-up first: date, then when it was logged. */
export function sortQuoteChaseLog<T extends Pick<QuoteChaseEntry, 'chased_on' | 'created_at'>>(log: T[]): T[] {
  return [...log].sort((a, b) => b.chased_on.localeCompare(a.chased_on) || String(b.created_at).localeCompare(String(a.created_at)))
}

/** The call-back that counts is on the newest follow-up. It is missed once its date has passed. */
export function currentCallback(
  log: Pick<QuoteChaseEntry, 'chased_on' | 'created_at' | 'next_follow_up' | 'contact' | 'deleted_at'>[],
  todayIso: string,
): Callback | null {
  const newest = sortQuoteChaseLog(log.filter((e) => !e.deleted_at))[0]
  if (!newest?.next_follow_up) return null
  const date = newest.next_follow_up.slice(0, 10)
  return { date, state: date < todayIso ? 'missed' : 'pending', contact: newest.contact }
}

export function quoteDivision(q: Pick<ChaseQuote, 'division_code' | 'reference_number'>): string {
  const own = String(q.division_code || '').trim()
  if (/^\d{2}$/.test(own)) return own
  const m = String(q.reference_number || '').match(/^[A-Z]{2,4}-(\d{2})-/i)
  return m ? m[1] : ''
}

export function divisionLabel(code: string): string {
  const d = DIVISIONS.find((x) => x.code === code)
  return d ? `${d.code} ${d.brand}` : code || 'No division'
}

/** Is the quote on the follow-up list today? */
export function isChaseable(q: ChaseQuote, todayIso: string): boolean {
  if (q.deleted_at) return false
  if (q.status === 'Sent' || q.status === 'Accepted') return true
  if (q.status === 'Expired' && isIsoDay(q.valid_until)) return daysBetween(q.valid_until, todayIso) <= EXPIRED_GRACE_DAYS
  return false
}

/** What to do next on one quote. Decisions first (award, expired), then promises, then the schedule. */
export function nextQuoteAction(input: {
  row: Omit<QuoteChaseRow, 'next_action'>
  tasks: Pick<QuoteChaseTask, 'id' | 'kind' | 'step_day' | 'due_on' | 'status'>[]
  steps: QuoteStep[]
  todayIso: string
}): QuoteNextAction {
  const { row: r, todayIso } = input
  if (r.status === 'Accepted') {
    return { kind: 'award', due_on: todayIso, text: 'The client accepted through the link: mark the quote Awarded.' }
  }
  if (r.po) {
    return { kind: 'award', due_on: todayIso, text: `Client PO ${r.po.po_number} received: mark the quote Awarded.` }
  }
  if (r.validity === 'expired' && r.valid_until) {
    const until = addDaysToIso(r.valid_until, EXPIRED_GRACE_DAYS)
    return {
      kind: 'expired',
      due_on: todayIso,
      text: `Expired on ${r.valid_until}: revise it, extend the validity or mark it not awarded (on this list until ${until}).`,
    }
  }
  if (r.callback?.state === 'missed') {
    return {
      kind: 'callback_missed',
      due_on: todayIso,
      text: `Call-back agreed for ${r.callback.date} was missed: follow up with ${r.callback.contact || 'the client'} today.`,
    }
  }
  if (r.response === 'declined') {
    return { kind: 'close', due_on: todayIso, text: 'The client declined: mark the quote Not awarded with the reason.' }
  }
  const open = input.tasks.filter((t) => t.status === 'open').sort((a, b) => a.due_on.localeCompare(b.due_on))
  if (open.length) {
    const t = open[0]
    return { kind: 'task', due_on: t.due_on, task_id: t.id, text: taskText(t, r.valid_until) }
  }
  if (r.callback?.state === 'pending') {
    return { kind: 'await_callback', due_on: r.callback.date, text: `Follow up on ${r.callback.date} as agreed with ${r.callback.contact || 'the client'}.` }
  }
  const due = input.steps.filter((s) => !stepCovered(s, r.last_contact_on))
  const reached = due.filter((s) => s.due_on <= todayIso)
  const last = reached[reached.length - 1]
  if (last && !input.tasks.some((t) => t.due_on >= last.due_on)) {
    return { kind: last.kind, due_on: todayIso, text: `${stepLabel(last, r.valid_until)} now.` }
  }
  const next = due.find((s) => s.due_on > todayIso)
  if (next) return { kind: next.kind, due_on: next.due_on, text: `${stepLabel(next, r.valid_until)} on ${next.due_on}.` }
  return { kind: 'none', due_on: null, text: 'Every follow-up is done. Ask for a decision, or mark the quote not awarded.' }
}

export function stepLabel(s: Pick<QuoteStep, 'kind' | 'step_day'>, validUntil: string | null): string {
  if (s.kind === 'escalate') return `Escalate to the owner (day ${s.step_day} with no decision)`
  if (s.kind === 'expiry') return `Remind the client it expires${validUntil ? ` on ${validUntil}` : ''}`
  return `Day ${s.step_day} follow-up`
}

function taskText(t: Pick<QuoteChaseTask, 'kind' | 'step_day'>, validUntil: string | null): string {
  if (t.kind === 'escalate') return `${stepLabel(t, validUntil)}.`
  return `${stepLabel(t, validUntil)} (draft ready).`
}

/**
 * One row per quote waiting for an answer: Sent or Accepted, plus quotes that
 * expired in the last 7 days. Drafts, awarded, not awarded and superseded
 * quotes are left out.
 */
export function buildQuoteChaseRows(input: {
  quotes: ChaseQuote[]
  log: QuoteChaseEntry[]
  tasks: QuoteChaseTask[]
  pos?: ChaseQuotePo[]
  settings: QuoteChaseSettings
  today: Date
}): QuoteChaseRow[] {
  const todayIso = isoDate(input.today)
  const logBy = groupBy(input.log.filter((e) => !e.deleted_at), (e) => e.quotation_id)
  const tasksBy = groupBy(input.tasks, (t) => t.quotation_id)
  const poById = new Map<string, ChaseQuotePo>()
  const poByRef = new Map<string, ChaseQuotePo>()
  for (const p of input.pos || []) {
    if (p.quotation_id && !poById.has(p.quotation_id)) poById.set(p.quotation_id, p)
    const ref = String(p.quote_reference || '').trim().toUpperCase()
    if (ref && !poByRef.has(ref)) poByRef.set(ref, p)
  }
  const warn = input.settings.expiryWarnDays || 3
  const rows: QuoteChaseRow[] = []
  for (const q of input.quotes) {
    if (!isChaseable(q, todayIso)) continue
    const sentIso = [q.sent_at, q.date, q.created_at].find(isIsoDay)?.slice(0, 10) || todayIso
    const days = Math.max(0, daysBetween(sentIso, todayIso))
    const validUntil = isIsoDay(q.valid_until) ? q.valid_until.slice(0, 10) : null
    const toExpiry = validUntil ? daysBetween(todayIso, validUntil) : null
    const validity: Validity =
      q.status === 'Expired' || (toExpiry !== null && toExpiry < 0) ? 'expired' : toExpiry === null ? 'none' : toExpiry <= warn ? 'expiring' : 'ok'
    const log = sortQuoteChaseLog(logBy.get(q.id) || [])
    const ref = String(q.reference_number || '').trim()
    const po = poById.get(q.id) || poByRef.get(ref.toUpperCase()) || null
    const contacted = [log[0]?.chased_on, isIsoDay(q.followed_up_at) ? q.followed_up_at.slice(0, 10) : null]
      .filter((x): x is string => Boolean(x))
      .sort()
      .pop() || null
    const base: Omit<QuoteChaseRow, 'next_action'> = {
      quote_id: q.id,
      reference: ref,
      client: String(q.client || '').trim() || 'No client',
      account_id: q.account_id || null,
      created_by: String(q.created_by || '').trim().toLowerCase(),
      division: quoteDivision(q),
      currency: String(q.quotation_currency || q.currency || 'AED').toUpperCase(),
      amount: roundMoney(Number(q.amount) || 0),
      status: q.status,
      sent_on: sentIso,
      days_since_sent: days,
      bucket: waitBucket(days),
      valid_until: validUntil,
      days_to_expiry: toExpiry,
      validity,
      last_chase: log[0] ? { chased_on: log[0].chased_on, channel: log[0].channel, contact: log[0].contact, note: log[0].note } : null,
      chase_count: log.length,
      last_contact_on: contacted,
      response: (log.find((e) => e.response)?.response || '') as QuoteResponse | '',
      callback: currentCallback(log, todayIso),
      po: po ? { po_number: po.po_number, po_date: po.po_date || null } : null,
    }
    rows.push({
      ...base,
      next_action: nextQuoteAction({
        row: base,
        tasks: tasksBy.get(q.id) || [],
        steps: quoteSteps(input.settings, sentIso, validUntil),
        todayIso,
      }),
    })
  }
  return rows.sort((a, b) => urgency(a) - urgency(b) || b.days_since_sent - a.days_since_sent || a.reference.localeCompare(b.reference))
}

/** Decisions and missed call-backs first, then the rest by how long they waited. */
function urgency(r: QuoteChaseRow): number {
  switch (r.next_action.kind) {
    case 'award':
      return 0
    case 'expired':
    case 'callback_missed':
      return 1
    case 'close':
      return 2
    default:
      return 3
  }
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

// ---- Totals, filters, sorting ---------------------------------------------------

export type QuoteChaseTotals = Record<WaitBucket, number> & { total: number; count: number }

/** Value waiting for an answer, per currency (never added across currencies), by how long. */
export function quoteChaseTotalsByCurrency(rows: QuoteChaseRow[]): Record<string, QuoteChaseTotals> {
  const out: Record<string, QuoteChaseTotals> = {}
  for (const r of rows) {
    const t = (out[r.currency] ||= { '0-7': 0, '8-14': 0, '15-30': 0, '31+': 0, total: 0, count: 0 })
    t[r.bucket] = roundMoney(t[r.bucket] + r.amount)
    t.total = roundMoney(t.total + r.amount)
    t.count += 1
  }
  return out
}

export const QUOTE_CHASE_STATES = [
  { value: 'decide', label: 'Needs a decision (accepted, PO, expired, declined)' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'missed', label: 'Missed call-back' },
  { value: 'due', label: 'Follow-up due now' },
] as const
export type QuoteChaseState = (typeof QUOTE_CHASE_STATES)[number]['value']
export const QUOTE_CHASE_STATE_VALUES = QUOTE_CHASE_STATES.map((s) => s.value) as QuoteChaseState[]

export function rowInState(r: QuoteChaseRow, state: string, todayIso: string): boolean {
  switch (state) {
    case 'decide':
      return ['award', 'expired', 'close'].includes(r.next_action.kind)
    case 'expiring':
      return r.validity === 'expiring'
    case 'missed':
      return r.callback?.state === 'missed'
    case 'due':
      return Boolean(r.next_action.due_on && r.next_action.due_on <= todayIso)
    default:
      return true
  }
}

export function filterQuoteChaseRows(
  rows: QuoteChaseRow[],
  f: { client?: string; division?: string; bucket?: string; state?: string },
  todayIso: string,
): QuoteChaseRow[] {
  const client = (f.client || '').trim().toLowerCase()
  return rows.filter(
    (r) =>
      (!client || r.client.toLowerCase().includes(client) || r.reference.toLowerCase() === client) &&
      (!f.division || r.division === f.division) &&
      (!f.bucket || r.bucket === f.bucket) &&
      (!f.state || rowInState(r, f.state, todayIso)),
  )
}

export type QuoteChaseSortKey = 'client' | 'reference' | 'sent_on' | 'days_since_sent' | 'amount' | 'valid_until' | 'last_chase' | 'next_action'

export function sortQuoteChaseRows(rows: QuoteChaseRow[], key: QuoteChaseSortKey, dir: 'asc' | 'desc'): QuoteChaseRow[] {
  const val = (r: QuoteChaseRow): string | number => {
    switch (key) {
      case 'client':
        return r.client.toLowerCase()
      case 'reference':
        return r.reference
      case 'sent_on':
        return r.sent_on
      case 'days_since_sent':
        return r.days_since_sent
      case 'amount':
        return r.amount
      case 'valid_until':
        return r.valid_until || '9999-12-31'
      case 'last_chase':
        return r.last_contact_on || ''
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

// ---- Tasks ------------------------------------------------------------------

export type NewQuoteChaseTask = Pick<QuoteChaseTask, 'quotation_id' | 'step_day' | 'kind' | 'due_on' | 'assigned_to'>

/**
 * Tasks to add now: for each Sent quote, the latest step it has reached that
 * has no task yet and was not already covered by a follow-up. Earlier missed
 * steps are not added late (one task, not three at once). Nothing while a
 * call-back is still to come, after the client declined, or when the quote
 * needs a decision instead (accepted, PO received, expired).
 */
export function planQuoteChaseTasks(input: {
  rows: QuoteChaseRow[]
  tasks: Pick<QuoteChaseTask, 'quotation_id' | 'kind' | 'step_day' | 'due_on'>[]
  settings: QuoteChaseSettings
  today: Date
  ownerByAccount?: Map<string, string>
  userByEmail?: Map<string, string>
}): NewQuoteChaseTask[] {
  const todayIso = isoDate(input.today)
  const have = groupBy(input.tasks, (t) => t.quotation_id)
  const out: NewQuoteChaseTask[] = []
  for (const r of input.rows) {
    if (r.status !== 'Sent' || r.po || r.validity === 'expired') continue
    if (r.callback?.state === 'pending' || r.response === 'declined') continue
    const steps = quoteSteps(input.settings, r.sent_on, r.valid_until).filter((s) => !stepCovered(s, r.last_contact_on))
    const reached = steps.filter((s) => s.due_on <= todayIso)
    const step = reached[reached.length - 1]
    if (!step) continue
    const existing = have.get(r.quote_id) || []
    if (existing.some((t) => t.kind === step.kind && t.step_day === step.step_day)) continue
    // A later step already has a task (the schedule was changed): do not go back.
    if (existing.some((t) => t.due_on > step.due_on)) continue
    out.push({
      quotation_id: r.quote_id,
      step_day: step.step_day,
      kind: step.kind,
      due_on: step.due_on,
      assigned_to:
        step.kind === 'escalate'
          ? input.settings.escalateToUserId
          : (r.account_id && input.ownerByAccount?.get(r.account_id)) || (r.created_by && input.userByEmail?.get(r.created_by)) || null,
    })
  }
  return out
}

/** Open tasks on quotes that are no longer waiting for an answer (awarded, closed, expired, accepted): close them. */
export function quoteTasksToClose(tasks: Pick<QuoteChaseTask, 'id' | 'quotation_id' | 'status'>[], rows: QuoteChaseRow[]): string[] {
  const waiting = new Set(rows.filter((r) => r.status === 'Sent' && !r.po && r.validity !== 'expired').map((r) => r.quote_id))
  return tasks.filter((t) => t.status === 'open' && !waiting.has(t.quotation_id)).map((t) => t.id)
}

// ---- Drafts (a person sends them) --------------------------------------------

export function quoteChaseDraft(input: {
  kind: QuoteTaskKind
  stepDay: number
  reference: string
  client: string
  contactName: string
  amount: number
  currency: string
  validUntil: string | null
  daysSinceSent: number
  companyName: string
}): { subject: string; body: string; whatsapp: string } {
  const amount = formatMoneyAmount(input.amount, input.currency || 'AED')
  const hello = `Dear ${input.contactName || `${input.client} team`},`
  const sign = ['', 'Kind regards,', input.companyName]
  if (input.kind === 'expiry') {
    const on = input.validUntil ? ` on ${input.validUntil}` : ' soon'
    return {
      subject: `Quote ${input.reference} is valid until ${input.validUntil || 'soon'}`,
      body: [
        hello,
        '',
        `A quick reminder that our quote ${input.reference} for ${amount} expires${on}.`,
        'If you would like to go ahead, please send us your purchase order before then. If you need more time or any changes, let us know and we will update the quote.',
        ...sign,
      ].join('\n'),
      whatsapp: `${hello} our quote ${input.reference} for ${amount} expires${on}. Shall we go ahead, or do you need more time or changes? ${input.companyName}`,
    }
  }
  if (input.kind === 'escalate') {
    return {
      subject: `Quote ${input.reference}: can we help you decide?`,
      body: [
        hello,
        '',
        `We sent you quote ${input.reference} for ${amount} ${input.daysSinceSent} days ago and want to make sure it meets your needs.`,
        'Could we arrange a short call this week to go through it? If the scope, price or timing needs to change, we are happy to revise it.',
        ...sign,
      ].join('\n'),
      whatsapp: `${hello} following up on quote ${input.reference} for ${amount}, sent ${input.daysSinceSent} days ago. Could we have a short call this week to go through it? ${input.companyName}`,
    }
  }
  const tone = input.stepDay <= 3 ? 'I hope you have had a chance to look at' : input.stepDay <= 7 ? 'I am following up on' : 'I wanted to check in once more on'
  return {
    subject: `Following up: quote ${input.reference} for ${input.client}`,
    body: [
      hello,
      '',
      `${tone} our quote ${input.reference} for ${amount}.`,
      `Please let me know if you have any questions or would like any changes.${input.validUntil ? ` The quote is valid until ${input.validUntil}.` : ''}`,
      ...sign,
    ].join('\n'),
    whatsapp: `${hello} ${tone.charAt(0).toLowerCase() + tone.slice(1)} our quote ${input.reference} for ${amount}. Any questions, or shall we go ahead? ${input.companyName}`,
  }
}

// ---- AI connector summary ---------------------------------------------------------

/** Follow-up block for dashboard_summary and list_quote_followups. */
export function quoteFollowupSummary(rows: QuoteChaseRow[], today: Date, max = 20) {
  const todayIso = isoDate(today)
  const brief = (r: QuoteChaseRow) => ({
    quote_id: r.quote_id,
    reference: r.reference,
    client: r.client,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    days_since_sent: r.days_since_sent,
    valid_until: r.valid_until,
  })
  return {
    totals_by_currency: quoteChaseTotalsByCurrency(rows),
    waiting: rows.length,
    needs_decision: rows.filter((r) => rowInState(r, 'decide', todayIso)).slice(0, max).map((r) => ({ ...brief(r), why: r.next_action.text })),
    po_not_awarded: rows.filter((r) => r.po && r.status !== 'Accepted').slice(0, max).map((r) => ({ ...brief(r), po_number: r.po!.po_number })),
    expiring_soon: rows.filter((r) => r.validity === 'expiring').slice(0, max).map(brief),
    missed_callbacks: rows
      .filter((r) => r.callback?.state === 'missed')
      .slice(0, max)
      .map((r) => ({ ...brief(r), callback_date: r.callback!.date })),
    next_actions: rows.slice(0, max).map((r) => ({
      ...brief(r),
      bucket: r.bucket,
      last_follow_up: r.last_contact_on,
      response: r.response || null,
      next_action: r.next_action.text,
      next_action_due: r.next_action.due_on,
      task_id: r.next_action.task_id ?? null,
    })),
  }
}
