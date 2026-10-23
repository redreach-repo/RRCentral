import { addDays, format, isFriday, isSaturday, isSunday, startOfWeek } from 'date-fns'
import type { Account, Contract, TimeCategory, TimeEntry } from './types'

/**
 * Helpers that keep time logging close to automatic: the client page timer,
 * the time box on ticket replies and the Friday "no hours this week" list.
 */

/** A timer that runs in this browser. One at a time per person. */
export type RunningTimer = {
  accountId: string
  accountName: string
  startedAt: string
  category: TimeCategory
}

/** Past this many hours a timer was probably left running, so check before logging. */
export const FORGOTTEN_TIMER_HOURS = 10
export const TIMER_EVENT = 'rr-timer-change'
const TIMER_KEY = 'rrcentral_timer'
const FRIDAY_KEY = 'rrcentral_friday_hours_notified'

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function timerKey(email: string): string {
  return `${TIMER_KEY}:${email.trim().toLowerCase()}`
}

export function readTimer(email: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): RunningTimer | null {
  if (!email) return null
  try {
    const raw = storage?.getItem(timerKey(email))
    if (!raw) return null
    const t = JSON.parse(raw) as Partial<RunningTimer>
    if (!t.accountId || !t.startedAt || Number.isNaN(Date.parse(t.startedAt))) return null
    return {
      accountId: t.accountId,
      accountName: t.accountName || 'Client',
      startedAt: t.startedAt,
      category: t.category || 'build',
    }
  } catch {
    return null
  }
}

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TIMER_EVENT))
}

export function saveTimer(email: string, timer: RunningTimer, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(timerKey(email), JSON.stringify(timer))
  } catch {
    // private mode: the timer lasts until the page is closed
  }
  announce()
}

export function clearTimer(email: string, storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    storage?.removeItem(timerKey(email))
  } catch {
    // nothing stored
  }
  announce()
}

/** Elapsed time rounded to the nearest quarter hour, at least 0.25 and at most 24. */
export function timerHours(startedAt: string, now: Date = new Date()): number {
  const ms = Math.max(0, now.getTime() - Date.parse(startedAt))
  const quarters = Math.round(ms / (15 * 60 * 1000))
  return Math.min(24, Math.max(1, quarters) / 4)
}

/** Raw elapsed hours, for the forgotten timer check. */
export function elapsedHours(startedAt: string, now: Date = new Date()): number {
  return Math.max(0, now.getTime() - Date.parse(startedAt)) / 3_600_000
}

/** `1:05` style clock for the running timer. */
export function elapsedLabel(startedAt: string, now: Date = new Date()): string {
  const totalMinutes = Math.floor(Math.max(0, now.getTime() - Date.parse(startedAt)) / 60_000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Choices for the time box on a ticket reply, in hours. */
export const TICKET_TIME_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'No time' },
  { value: 0.25, label: '15 min' },
  { value: 0.5, label: '30 min' },
  { value: 0.75, label: '45 min' },
  { value: 1, label: '1 hour' },
  { value: 1.5, label: '1.5 hours' },
  { value: 2, label: '2 hours' },
  { value: 3, label: '3 hours' },
]

export function hoursLabel(hours: number): string {
  return `${Math.round(hours * 100) / 100}h`
}

/** Monday of the week containing `today`, as `YYYY-MM-DD`. */
export function weekStartKey(today: Date = new Date()): string {
  return format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

/** The Friday reminder shows from Friday until the week ends on Sunday. */
export function isHoursReminderDay(today: Date = new Date()): boolean {
  return isFriday(today) || isSaturday(today) || isSunday(today)
}

function contractRunning(c: Pick<Contract, 'status' | 'term_start' | 'term_end'>, today: string): boolean {
  if (c.status !== 'active') return false
  if (c.term_start && c.term_start.slice(0, 10) > today) return false
  if (c.term_end && c.term_end.slice(0, 10) < today) return false
  return true
}

/**
 * AI CRM clients on a running contract with no hours logged from Monday to
 * `today`. These are the names on the Friday reminder.
 */
export function clientsWithoutHoursThisWeek(input: {
  accounts: Pick<Account, 'id' | 'name' | 'type'>[]
  contracts: Pick<Contract, 'account_id' | 'status' | 'term_start' | 'term_end'>[]
  entries: Pick<TimeEntry, 'account_id' | 'date'>[]
  today?: Date
}): Pick<Account, 'id' | 'name'>[] {
  const now = input.today ?? new Date()
  const from = weekStartKey(now)
  const to = format(addDays(new Date(`${from}T00:00:00`), 6), 'yyyy-MM-dd')
  const todayKey = format(now, 'yyyy-MM-dd')
  const logged = new Set(
    input.entries
      .filter((e) => {
        const d = String(e.date).slice(0, 10)
        return d >= from && d <= to
      })
      .map((e) => e.account_id),
  )
  return input.accounts
    .filter((a) => a.type === 'ai_crm_client')
    .filter((a) => input.contracts.some((c) => c.account_id === a.id && contractRunning(c, todayKey)))
    .filter((a) => !logged.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function fridayReminderMessage(names: string[]): string {
  if (names.length === 0) return ''
  const shown = names.slice(0, 5).join(', ')
  const more = names.length > 5 ? ` and ${names.length - 5} more` : ''
  const noun = names.length === 1 ? 'client has' : 'clients have'
  return `${names.length} ${noun} no hours this week: ${shown}${more}. Log them before the week ends.`
}

/** True once per week per browser, so the desktop reminder shows only once. */
export function shouldSendFridayReminder(
  now: Date = new Date(),
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): boolean {
  if (!isHoursReminderDay(now)) return false
  try {
    return storage?.getItem(FRIDAY_KEY) !== weekStartKey(now)
  } catch {
    return true
  }
}

export function markFridayReminderSent(now: Date = new Date(), storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(FRIDAY_KEY, weekStartKey(now))
  } catch {
    // private mode: harmless to remind again
  }
}
