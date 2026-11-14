import { describe, expect, it } from 'vitest'
import { t } from './i18n'

const PAGE_KEYS = [
  'page.dashboard.title',
  'page.dashboard.loading',
  'page.dashboard.heroToday',
  'page.dashboard.heroTitleDue',
  'page.dashboard.heroTitleClear',
  'page.dashboard.heroOneFollowUp',
  'page.dashboard.heroNFollowUps',
  'page.dashboard.heroClearLine',
  'page.dashboard.heroIncomeNote',
  'page.dashboard.openMyDay',
  'page.dashboard.pipeline',
  'page.dashboard.quotations',
  'page.dashboard.overdue',
  'page.dashboard.dueToday',
  'page.dashboard.openDeals',
  'page.dashboard.thisMonth',
  'page.dashboard.reports',
  'page.dashboard.income',
  'page.dashboard.expenses',
  'page.dashboard.net',
  'page.dashboard.ytdPaid',
  'page.dashboard.ytd',
  'page.dashboard.netHint',
  'page.dashboard.schedule',
  'page.dashboard.allFollowUps',
  'page.dashboard.openQuotes',
  'page.dashboard.pendingInvoices',
  'page.dashboard.overdueFollowUps',
  'page.crm.kicker',
  'page.crm.title',
  'page.crm.subtitleCompact',
  'page.crm.subtitleLead',
  'page.crm.addCompany',
  'page.deals.kicker',
  'page.deals.title',
  'page.deals.subtitle',
  'page.login.title',
  'page.login.subtitle',
  'page.login.email',
  'page.login.password',
  'page.login.signIn',
  'page.login.signingIn',
  'page.login.loading',
  'page.docs.kicker',
  'page.quotations.title',
  'page.quotations.subtitle',
  'page.quotations.new',
  'page.invoices.title',
  'page.invoices.subtitle',
  'page.invoices.new',
  'page.deliveryNotes.title',
  'page.deliveryNotes.subtitle',
  'page.deliveryNotes.new',
  'page.finance.kicker',
  'page.payments.title',
  'page.payments.subtitle',
  'page.payments.new',
  'page.expenses.title',
  'page.expenses.subtitle',
  'page.expenses.new',
  'page.expenses.syncMonthly',
] as const

describe('page body i18n catalogs', () => {
  it('has EN and AR entries for sales and finance page chrome', () => {
    for (const key of PAGE_KEYS) {
      expect(t('en', key)).not.toBe(key)
      expect(t('ar', key)).not.toBe(key)
    }
  })

  it('interpolates follow-up count placeholders', () => {
    expect(t('en', 'page.dashboard.heroNFollowUps').replace('{n}', '3')).toBe('3 follow-ups need you.')
    expect(t('ar', 'page.dashboard.heroNFollowUps').replace('{n}', '3')).toContain('3')
  })
})
