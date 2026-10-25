/**
 * CTRM Next contract and renewal dates (Wave 5, PR Y), following the
 * WorshipHub renewal date: contract start, renewal date and notice period.
 * Reminders at 90, 60 and 30 days before renewal on the dashboard and in the
 * daily digest, with the last day to give notice. Pure (bundled into the
 * daily-digest function).
 */
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'
import type { CtrmClientTerms } from './types'

export const RENEWAL_REMINDER_DAYS = [90, 60, 30] as const
export type RenewalStage = (typeof RENEWAL_REMINDER_DAYS)[number] | 'passed'

/** How long after the renewal date a missed one keeps showing. */
export const PASSED_SHOW_DAYS = 30

export type RenewalInfo = {
  accountId: string
  renewal: string
  days: number
  stage: RenewalStage | null
  /** Last day to give notice, or null without a notice period. */
  noticeBy: string | null
  noticeDaysLeft: number | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function renewalInfo(t: Pick<CtrmClientTerms, 'account_id' | 'renewal_date' | 'notice_days'>, today: Date = new Date()): RenewalInfo | null {
  const renewal = String(t.renewal_date || '').slice(0, 10)
  if (!DATE.test(renewal)) return null
  const days = differenceInCalendarDays(parseISO(renewal), today)
  const notice = Math.max(0, Math.round(Number(t.notice_days) || 0))
  const noticeBy = notice ? format(subDays(parseISO(renewal), notice), 'yyyy-MM-dd') : null
  const stage: RenewalStage | null = days < 0 ? 'passed' : (([...RENEWAL_REMINDER_DAYS].reverse().find((d) => days <= d) as RenewalStage | undefined) ?? null)
  return {
    accountId: t.account_id,
    renewal,
    days,
    stage,
    noticeBy,
    noticeDaysLeft: noticeBy ? differenceInCalendarDays(parseISO(noticeBy), today) : null,
  }
}

/** Renewals to show on the dashboard: within 90 days, or passed in the last 30. Soonest first. */
export function upcomingRenewals(terms: Pick<CtrmClientTerms, 'account_id' | 'renewal_date' | 'notice_days'>[], today: Date = new Date()): RenewalInfo[] {
  return terms
    .map((t) => renewalInfo(t, today))
    .filter((r): r is RenewalInfo => Boolean(r && r.stage && r.days >= -PASSED_SHOW_DAYS))
    .sort((a, b) => a.days - b.days)
}

/**
 * Renewals the digest mentions today: on the 90, 60 and 30 day marks, every day
 * in the last 14 days and once passed, and every day of the week before the
 * notice deadline.
 */
export function digestRenewals(terms: Pick<CtrmClientTerms, 'account_id' | 'renewal_date' | 'notice_days'>[], today: Date = new Date()): RenewalInfo[] {
  return upcomingRenewals(terms, today).filter(
    (r) =>
      (RENEWAL_REMINDER_DAYS as readonly number[]).includes(r.days) ||
      r.days <= 14 ||
      (r.noticeDaysLeft !== null && r.noticeDaysLeft >= 0 && r.noticeDaysLeft <= 7),
  )
}

export const isUrgentRenewal = (r: RenewalInfo) => r.days <= 30 || (r.noticeDaysLeft !== null && r.noticeDaysLeft >= 0 && r.noticeDaysLeft <= 7)

const day = (d: string) => format(parseISO(d), 'd MMM yyyy')

/** "Renews in 60 days (24 Dec 2026). Notice by 24 Nov 2026." */
export function renewalText(r: RenewalInfo): string {
  const when =
    r.days < 0 ? `Renewal date passed ${Math.abs(r.days)} days ago (${day(r.renewal)})` : r.days === 0 ? `Renews today (${day(r.renewal)})` : `Renews in ${r.days} days (${day(r.renewal)})`
  if (!r.noticeBy || r.noticeDaysLeft === null) return `${when}.`
  const notice =
    r.noticeDaysLeft < 0 ? `Notice deadline passed on ${day(r.noticeBy)}` : r.noticeDaysLeft === 0 ? 'Last day to give notice is today' : `Notice by ${day(r.noticeBy)}`
  return `${when}. ${notice}.`
}

/** Why the dates cannot be saved, or null. */
export function termsProblem(t: Pick<CtrmClientTerms, 'contract_start' | 'renewal_date' | 'notice_days'>): string | null {
  if (t.contract_start && !DATE.test(t.contract_start)) return 'Pick the contract start date'
  if (t.renewal_date && !DATE.test(t.renewal_date)) return 'Pick the renewal date'
  if (t.contract_start && t.renewal_date && t.renewal_date <= t.contract_start) return 'The renewal date must be after the contract start'
  const n = Number(t.notice_days)
  if (!Number.isInteger(n) || n < 0 || n > 365) return 'The notice period is a number of days, 0 to 365'
  return null
}
