import { describe, expect, it } from 'vitest'
import { buildDigest, digestSections } from './dailyDigest'
import { digestRenewals, isUrgentRenewal, renewalInfo, renewalText, termsProblem, upcomingRenewals } from './ctrmRenewals'

const today = new Date('2026-10-25T08:00:00')
const t = (account_id: string, renewal_date: string | null, notice_days = 0) => ({ account_id, renewal_date, notice_days })

describe('renewalInfo', () => {
  it('works out days, the reminder stage and the notice deadline', () => {
    expect(renewalInfo(t('a', '2027-01-23', 30), today)).toEqual({
      accountId: 'a',
      renewal: '2027-01-23',
      days: 90,
      stage: 90,
      noticeBy: '2026-12-24',
      noticeDaysLeft: 60,
    })
    expect(renewalInfo(t('a', '2026-12-24'), today)?.stage).toBe(60)
    expect(renewalInfo(t('a', '2026-11-10'), today)?.stage).toBe(30)
    expect(renewalInfo(t('a', '2027-06-01'), today)?.stage).toBeNull()
    expect(renewalInfo(t('a', '2026-10-01'), today)?.stage).toBe('passed')
    expect(renewalInfo(t('a', null), today)).toBeNull()
  })
})

describe('reminders', () => {
  const terms = [
    t('ninety', '2027-01-23'),
    t('eightynine', '2027-01-22'),
    t('sixty', '2026-12-24'),
    t('thirty', '2026-11-24'),
    t('ten', '2026-11-04'),
    t('notice', '2026-12-10', 40),
    t('passed', '2026-10-10'),
    t('long-gone', '2026-08-01'),
    t('far', '2027-08-01'),
  ]
  it('shows everything within 90 days or passed in the last 30 on the dashboard', () => {
    expect(upcomingRenewals(terms, today).map((r) => r.accountId)).toEqual(['passed', 'ten', 'thirty', 'notice', 'sixty', 'eightynine', 'ninety'])
  })
  it('mentions them in the digest on the marks, the last 14 days and the notice week', () => {
    expect(digestRenewals(terms, today).map((r) => r.accountId)).toEqual(['passed', 'ten', 'thirty', 'notice', 'sixty', 'ninety'])
  })
  it('is urgent within 30 days or in the notice week', () => {
    expect(isUrgentRenewal(renewalInfo(t('x', '2026-11-24'), today)!)).toBe(true)
    expect(isUrgentRenewal(renewalInfo(t('x', '2026-12-10', 40), today)!)).toBe(true)
    expect(isUrgentRenewal(renewalInfo(t('x', '2026-12-24'), today)!)).toBe(false)
  })
  it('puts a CTRM Next renewals section in the digest', () => {
    const d = buildDigest({ now: today, accounts: [{ id: 'sixty', name: 'Gulf Refining', type: 'ctrm_prospect' }], contracts: [], packages: [], entries: [], tickets: [], deals: [], ctrmTerms: terms })
    expect(d.ctrmRenewals?.find((i) => i.name === 'Gulf Refining')).toMatchObject({ detail: 'Renews in 60 days (24 Dec 2026).', path: '/accounts/sixty', urgent: false })
    expect(digestSections(d).some((s) => s.key === 'ctrmRenewals')).toBe(true)
  })
})

describe('words and checks', () => {
  it('describes a renewal', () => {
    expect(renewalText(renewalInfo(t('a', '2027-01-23', 30), today)!)).toBe('Renews in 90 days (23 Jan 2027). Notice by 24 Dec 2026.')
    expect(renewalText(renewalInfo(t('a', '2026-10-25'), today)!)).toBe('Renews today (25 Oct 2026).')
    expect(renewalText(renewalInfo(t('a', '2026-11-04', 30), today)!)).toBe('Renews in 10 days (4 Nov 2026). Notice deadline passed on 5 Oct 2026.')
  })
  it('checks the dates', () => {
    expect(termsProblem({ contract_start: '2026-01-01', renewal_date: '2027-01-01', notice_days: 30 })).toBeNull()
    expect(termsProblem({ contract_start: '2027-01-01', renewal_date: '2026-01-01', notice_days: 0 })).toMatch(/after/)
    expect(termsProblem({ contract_start: null, renewal_date: null, notice_days: 400 })).toMatch(/notice/)
  })
})
