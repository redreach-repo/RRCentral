// Working time and SLA rules for the support desk. Kept free of imports so the
// email-in Edge Function can bundle the same code (app/scripts/build-support-function.mjs).

export type WorkingCalendar = {
  /** ISO weekdays that count as working days, 1 = Monday ... 7 = Sunday. */
  days: number[]
  /** Minutes after midnight, local time. */
  startMinute: number
  endMinute: number
  /** Local time offset from UTC in minutes. Dubai is UTC+4 all year. */
  utcOffsetMinutes: number
}

export const DEFAULT_WORKING_CALENDAR: WorkingCalendar = {
  days: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 18 * 60,
  utcOffsetMinutes: 4 * 60,
}

export const SUPPORT_SETTING_KEYS = {
  days: 'supportWorkingDays',
  start: 'supportDayStart',
  end: 'supportDayEnd',
} as const

/** Share of the SLA window left at which a ticket shows the warning state. */
export const SLA_WARNING_SHARE = 0.25

/** Default first response for account types without a package (WorshipHub: 2 working days). */
export const DEFAULT_ACCOUNT_TYPE_HOURS = 18

const MINUTE = 60_000
const DAY_MINUTES = 24 * 60

function parseClock(raw: string | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((raw || '').trim())
  if (!m) return fallback
  const v = Number(m[1]) * 60 + Number(m[2])
  return v >= 0 && v <= DAY_MINUTES ? v : fallback
}

/** Reads the working week from app settings, falling back to Monday to Friday, 09:00 to 18:00. */
export function calendarFromSettings(settings: Record<string, string | undefined>): WorkingCalendar {
  const days = (settings[SUPPORT_SETTING_KEYS.days] || '')
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  const startMinute = parseClock(settings[SUPPORT_SETTING_KEYS.start], DEFAULT_WORKING_CALENDAR.startMinute)
  const endMinute = parseClock(settings[SUPPORT_SETTING_KEYS.end], DEFAULT_WORKING_CALENDAR.endMinute)
  const valid = endMinute > startMinute
  return {
    days: days.length ? [...new Set(days)].sort() : DEFAULT_WORKING_CALENDAR.days,
    startMinute: valid ? startMinute : DEFAULT_WORKING_CALENDAR.startMinute,
    endMinute: valid ? endMinute : DEFAULT_WORKING_CALENDAR.endMinute,
    utcOffsetMinutes: DEFAULT_WORKING_CALENDAR.utcOffsetMinutes,
  }
}

/** Length of one working day in hours. */
export function workingDayHours(cal: WorkingCalendar): number {
  return (cal.endMinute - cal.startMinute) / 60
}

/**
 * Adds working hours to a moment. Time outside working hours does not count,
 * so a ticket that arrives on a Saturday starts its clock on Monday morning.
 */
export function addWorkingHours(from: Date, hours: number, cal: WorkingCalendar = DEFAULT_WORKING_CALENDAR): Date {
  if (!cal.days.length || cal.endMinute <= cal.startMinute) return new Date(from.getTime() + hours * 60 * MINUTE)
  // Work in "local wall time" expressed as minutes since the epoch.
  let t = Math.floor(from.getTime() / MINUTE) + cal.utcOffsetMinutes
  let remaining = Math.max(0, Math.round(hours * 60))
  for (let guard = 0; guard < 3700; guard++) {
    const dayStart = Math.floor(t / DAY_MINUTES) * DAY_MINUTES
    const minuteOfDay = t - dayStart
    const isoDay = ((Math.floor(t / DAY_MINUTES) + 3) % 7) + 1 // 1970-01-01 was a Thursday
    if (!cal.days.includes(isoDay) || minuteOfDay >= cal.endMinute) {
      t = dayStart + DAY_MINUTES + cal.startMinute
      continue
    }
    if (minuteOfDay < cal.startMinute) t = dayStart + cal.startMinute
    const available = dayStart + cal.endMinute - t
    if (remaining <= available) {
      t += remaining
      return new Date((t - cal.utcOffsetMinutes) * MINUTE)
    }
    remaining -= available
    t = dayStart + DAY_MINUTES + cal.startMinute
  }
  return new Date((t - cal.utcOffsetMinutes) * MINUTE)
}

type PolicyLike = {
  applies_to: 'package' | 'account_type'
  package_id: string | null
  account_type: string | null
  first_response_hours: number
}

/**
 * First response hours for an account: its active package's policy when it has
 * one, else the policy for its account type, else 2 working days.
 */
export function slaHoursFor(
  accountType: string | null | undefined,
  packageId: string | null | undefined,
  policies: PolicyLike[],
): number {
  if (packageId) {
    const p = policies.find((x) => x.applies_to === 'package' && x.package_id === packageId)
    if (p) return Number(p.first_response_hours)
  }
  if (accountType) {
    const p = policies.find((x) => x.applies_to === 'account_type' && x.account_type === accountType)
    if (p) return Number(p.first_response_hours)
  }
  return DEFAULT_ACCOUNT_TYPE_HOURS
}

export type SlaState = 'ok' | 'warning' | 'breached' | 'met' | 'missed' | 'none'

/**
 * Where a ticket stands against its first response SLA. Warning starts when
 * less than a quarter of the window is left; breached once the due time passes.
 */
export function slaState(
  ticket: { created_at: string; sla_due_at: string | null; first_response_at: string | null; status: string },
  now: Date = new Date(),
): SlaState {
  if (!ticket.sla_due_at) return 'none'
  const due = new Date(ticket.sla_due_at).getTime()
  if (ticket.first_response_at) return new Date(ticket.first_response_at).getTime() <= due ? 'met' : 'missed'
  if (ticket.status === 'resolved' || ticket.status === 'closed') return 'none'
  const created = new Date(ticket.created_at).getTime()
  const t = now.getTime()
  if (t > due) return 'breached'
  if (due - t <= (due - created) * SLA_WARNING_SHARE) return 'warning'
  return 'ok'
}
