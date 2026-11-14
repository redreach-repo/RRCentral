import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildDivisionPipeline } from '../lib/divisionPipeline'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Globe,
  Shield,
} from 'lucide-react'
import { format, isToday, parseISO, startOfDay, startOfMonth } from 'date-fns'
import { db } from '../lib/db'
import { PIPELINE_STAGES } from '../lib/config'
import type {
  CompanyDocument,
  CrmEntry,
  Expense,
  IncomeEntry,
  Invoice,
  OwnedDomain,
  Quotation,
} from '../lib/types'
import {
  countsTowardIncome,
  isInMonth,
  isOpenInvoice,
  sortByDateDesc,
  sumExpenses,
  sumRecognizedIncome,
} from '../lib/finance'
import { loadDeletedInvoiceRefs, reconcileInvoiceFinance } from '../lib/invoiceFinance'
import { listCompanyDocuments } from '../lib/companyDocs'
import { companyDocAlertLabel, companyDocExpiryAlerts } from '../lib/companyDocAlerts'
import { listOwnedDomains } from '../lib/domains'
import ModuleAlertsCard from '../components/accounts/ModuleAlertsCard'
import CtrmRenewalsCard from '../components/ctrm/CtrmRenewalsCard'
import WatchdogCard from '../components/watchdog/WatchdogCard'
import NoNextStepCard from '../components/deals/NoNextStepCard'
import NewLeadsCard from '../components/leads/NewLeadsCard'
import { domainAlertLabel, domainRenewalAlerts } from '../lib/domainAlerts'
import { syncUnansweredQuoteFollowUps } from '../lib/quoteFollowUpSync'
import { useSettings } from '../contexts/SettingsContext'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { useI18n } from '../contexts/I18nContext'
import { PRODUCT } from '../lib/product'
import { can } from '../lib/permissions'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import ZohoCalendarPanel from '../components/ZohoCalendarPanel'
import ZohoInboxPanel from '../components/ZohoInboxPanel'
import {
  cardStyle,
  colors,
  formatMoney,
  pageStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import dash from './DashboardPage.module.css'
import { errorMessage } from '../lib/errors'

export default function DashboardPage() {
  const { userRole } = useAuth()
  const { settings } = useSettings()
  const { activeCompany } = useTenant()
  const { t } = useI18n()
  const companyLabel =
    activeCompany?.name || settings.companyName || settings.brand || PRODUCT.name
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [income, setIncome] = useState<IncomeEntry[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [crm, setCrm] = useState<CrmEntry[]>([])
  const [deletedInvoiceRefs, setDeletedInvoiceRefs] = useState<string[]>([])
  const [companyDocs, setCompanyDocs] = useState<CompanyDocument[]>([])
  const [ownedDomains, setOwnedDomains] = useState<OwnedDomain[]>([])
  const [followUpSyncNote, setFollowUpSyncNote] = useState('')
  const [attentionOpen, setAttentionOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await reconcileInvoiceFinance()
      const deleted = await loadDeletedInvoiceRefs()
      const [qRes, iRes, incRes, expRes, crmRes, docsRes, domains] = await Promise.all([
        db.from('quotations').select('*'),
        db.from('invoices').select('*'),
        db.from('income').select('*'),
        db.from('expenses').select('*'),
        db.from('crm').select('*').order('follow_up_date', { ascending: true }),
        listCompanyDocuments().catch(() => ({ rows: [] as CompanyDocument[], missingTable: true })),
        listOwnedDomains().catch(() => [] as OwnedDomain[]),
      ])

      if (qRes.error) throw qRes.error
      if (iRes.error) throw iRes.error
      if (incRes.error) throw incRes.error
      if (expRes.error) throw expRes.error
      if (crmRes.error) throw crmRes.error

      setOwnedDomains(domains)
      const quotes = sortByDateDesc((qRes.data as Quotation[]) ?? [])
      let crmRows = (crmRes.data as CrmEntry[]) ?? []

      const daysAfter = Number(settings.followUpDaysAfterQuote) || 3
      try {
        const sync = await syncUnansweredQuoteFollowUps({
          quotations: quotes,
          crm: crmRows,
          daysAfter,
        })
        if (sync.updated > 0) {
          setFollowUpSyncNote(
            `Auto follow-up set on ${sync.updated} deal(s) with unanswered Sent quotes (${daysAfter}+ days).`,
          )
          const refreshed = await db.from('crm').select('*').order('follow_up_date', { ascending: true })
          if (!refreshed.error && refreshed.data) crmRows = refreshed.data as CrmEntry[]
        } else {
          setFollowUpSyncNote('')
        }
      } catch {
        setFollowUpSyncNote('')
      }

      setQuotations(quotes)
      setInvoices(sortByDateDesc((iRes.data as Invoice[]) ?? []))
      setIncome((incRes.data as IncomeEntry[]) ?? [])
      setExpenses((expRes.data as Expense[]) ?? [])
      setCrm(crmRows)
      setDeletedInvoiceRefs([...deleted])
      setCompanyDocs(docsRes.rows || [])
    } catch (e) {
      setError(errorMessage(e, 'Failed to load dashboard'))
    } finally {
      setLoading(false)
    }
  }, [settings.followUpDaysAfterQuote])

  useEffect(() => {
    void load()
  }, [load])

  const thisMonth = startOfMonth(new Date())
  const monthLabel = format(thisMonth, 'MMM yyyy')

  const recognizedIncome = useMemo(
    () => income.filter((r) => countsTowardIncome(r, invoices, deletedInvoiceRefs)),
    [income, invoices, deletedInvoiceRefs],
  )

  const monthIncome = useMemo(
    () =>
      recognizedIncome
        .filter((r) => isInMonth(r.date, thisMonth))
        .reduce((s, r) => s + Number(r.total_amount || 0), 0),
    [recognizedIncome, thisMonth],
  )

  const monthExpenses = useMemo(
    () =>
      expenses
        .filter((r) => isInMonth(r.date, thisMonth))
        .reduce((s, r) => s + Number(r.amount || 0), 0),
    [expenses, thisMonth],
  )

  const monthNet = monthIncome - monthExpenses
  const ytdIncome = useMemo(
    () => sumRecognizedIncome(income, invoices, deletedInvoiceRefs),
    [income, invoices, deletedInvoiceRefs],
  )
  const ytdExpenses = useMemo(() => sumExpenses(expenses), [expenses])

  const openQuotes = useMemo(
    () =>
      quotations.filter((q) =>
        ['Draft', 'Finalized', 'Sent'].includes(q.status),
      ).length,
    [quotations],
  )

  const pendingInvoices = useMemo(
    () => invoices.filter(isOpenInvoice).length,
    [invoices],
  )

  const overdueFollowUps = useMemo(() => {
    const today = startOfDay(new Date())
    return crm.filter((c) => {
      if (!c.follow_up_date) return false
      try {
        return parseISO(c.follow_up_date) < today
      } catch {
        return false
      }
    }).length
  }, [crm])

  const dueTodayFollowUps = useMemo(() => {
    return crm.filter((c) => {
      if (!c.follow_up_date) return false
      try {
        return isToday(parseISO(c.follow_up_date.slice(0, 10)))
      } catch {
        return false
      }
    }).length
  }, [crm])

  const myDayCount = overdueFollowUps + dueTodayFollowUps

  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of PIPELINE_STAGES) counts[s] = 0
    for (const c of crm) {
      const s = c.pipeline_stage || 'Lead'
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [crm])

  const openPipeline = useMemo(
    () =>
      crm.filter((c) => !['Won', 'Lost'].includes(c.pipeline_stage || 'Lead')).length,
    [crm],
  )

  const ownerWorkload = useMemo(() => {
    const today = startOfDay(new Date())
    const map = new Map<string, { open: number; overdue: number }>()
    for (const c of crm) {
      const owner = c.owner || 'Unassigned'
      const cur = map.get(owner) || { open: 0, overdue: 0 }
      if (!['Won', 'Lost'].includes(c.pipeline_stage || 'Lead')) cur.open += 1
      if (c.follow_up_date) {
        try {
          if (parseISO(c.follow_up_date) < today) cur.overdue += 1
        } catch {
          /* ignore */
        }
      }
      map.set(owner, cur)
    }
    return Array.from(map.entries())
      .map(([owner, v]) => ({ owner, ...v }))
      .sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.owner.localeCompare(b.owner))
  }, [crm])

  /** Pipeline = open quotes only. Awarded = won revenue potential (not income until paid). */
  const divisionBreakdown = useMemo(
    () => buildDivisionPipeline(quotations, invoices),
    [quotations, invoices],
  )

  const recentQuotes = quotations.slice(0, 6)
  const recentInvoices = invoices.filter((i) => i.status !== 'Cancelled').slice(0, 6)

  const docAlerts = useMemo(() => companyDocExpiryAlerts(companyDocs, 60), [companyDocs])
  const domainAlerts = useMemo(() => domainRenewalAlerts(ownedDomains, 90), [ownedDomains])
  const companyVaultRoot = (settings.companyDriveFolderUrl || '').trim()
  const showCompanyVault = can(userRole, 'settings.manage')

  if (loading) {
    return (
      <div className={dash.page} style={pageStyle}>
        <PageHeader title={t('page.dashboard.title')} subtitle={t('page.dashboard.loading')} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={dash.page} style={pageStyle}>
        <PageHeader title={t('page.dashboard.title')} />
        <div style={{ ...cardStyle, color: colors.danger }}>{error}</div>
      </div>
    )
  }

  const weekday = format(new Date(), 'EEEE')
  const heroLine =
    myDayCount > 0
      ? myDayCount === 1
        ? t('page.dashboard.heroOneFollowUp')
        : t('page.dashboard.heroNFollowUps').replace('{n}', String(myDayCount))
      : t('page.dashboard.heroClearLine')

  return (
    <div className={dash.page} style={pageStyle}>
      <section className={dash.hero} aria-label={t('page.dashboard.heroToday')}>
        <p className={dash.heroEyebrow}>
          {weekday} · {companyLabel}
        </p>
        <h1 className={dash.heroTitle}>
          {myDayCount > 0 ? t('page.dashboard.heroTitleDue') : t('page.dashboard.heroTitleClear')}
        </h1>
        <p className={dash.heroLead}>
          {heroLine} {t('page.dashboard.heroIncomeNote')}
        </p>
        <div className={dash.heroActions}>
          <Link to="/crm?follow=Due&owner=me" className={dash.heroPrimary}>
            <CalendarClock size={16} /> {t('page.dashboard.openMyDay')}
          </Link>
          <Link to="/deals?view=board" className={dash.heroSecondary}>
            {t('page.dashboard.pipeline')} <ArrowRight size={14} />
          </Link>
          <Link to="/quotations" className={dash.heroSecondary}>
            {t('page.dashboard.quotations')}
          </Link>
        </div>
        <div className={dash.heroStats}>
          <div className={dash.heroStat}>
            <div className={`${dash.heroStatValue} ${overdueFollowUps ? dash.heroStatValueWarn : ''}`}>
              {overdueFollowUps}
            </div>
            <div className={dash.heroStatLabel}>{t('page.dashboard.overdue')}</div>
          </div>
          <div className={dash.heroStat}>
            <div className={dash.heroStatValue}>{dueTodayFollowUps}</div>
            <div className={dash.heroStatLabel}>{t('page.dashboard.dueToday')}</div>
          </div>
          <div className={dash.heroStat}>
            <div className={dash.heroStatValue}>{openPipeline}</div>
            <div className={dash.heroStatLabel}>{t('page.dashboard.openDeals')}</div>
          </div>
        </div>
      </section>

      {followUpSyncNote ? (
        <p className={dash.note}>
          {followUpSyncNote}{' '}
          <Link to="/crm?follow=Due">Open due follow-ups</Link>
        </p>
      ) : null}

      <section className={dash.section} aria-label={t('page.dashboard.thisMonth')}>
        <div className={dash.sectionHead}>
          <h2 className={dash.sectionTitle}>
            {t('page.dashboard.thisMonth')} · {monthLabel}
          </h2>
          <Link to="/reports" className={dash.sectionLink}>
            {t('page.dashboard.reports')}
          </Link>
        </div>
        <div className={dash.moneyRow}>
          <div className={dash.moneyCard}>
            <div className={dash.moneyLabel}>{t('page.dashboard.income')}</div>
            <div className={dash.moneyValue} style={{ color: colors.success }}>
              {formatMoney(monthIncome)}
            </div>
            <div className={dash.moneyHint}>
              {t('page.dashboard.ytdPaid').replace('{amount}', formatMoney(ytdIncome))}
            </div>
          </div>
          <div className={dash.moneyCard}>
            <div className={dash.moneyLabel}>{t('page.dashboard.expenses')}</div>
            <div className={dash.moneyValue} style={{ color: colors.danger }}>
              {formatMoney(monthExpenses)}
            </div>
            <div className={dash.moneyHint}>
              {t('page.dashboard.ytd').replace('{amount}', formatMoney(ytdExpenses))}
            </div>
          </div>
          <div className={dash.moneyCard}>
            <div className={dash.moneyLabel}>{t('page.dashboard.net')}</div>
            <div
              className={dash.moneyValue}
              style={{ color: monthNet >= 0 ? colors.success : colors.danger }}
            >
              {formatMoney(monthNet)}
            </div>
            <div className={dash.moneyHint}>{t('page.dashboard.netHint')}</div>
          </div>
        </div>
      </section>

      <section className={dash.section} aria-label={t('page.dashboard.schedule')}>
        <div className={dash.sectionHead}>
          <h2 className={dash.sectionTitle}>{t('page.dashboard.schedule')}</h2>
          <Link to="/follow-ups" className={dash.sectionLink}>
            {t('page.dashboard.allFollowUps')}
          </Link>
        </div>
        <ZohoCalendarPanel crmEntries={crm} />
      </section>

      <section className={dash.section} aria-label={t('page.dashboard.pipeline')}>
        <div className={dash.sectionHead}>
          <h2 className={dash.sectionTitle}>{t('page.dashboard.pipeline')}</h2>
          <Link to="/crm" className={dash.sectionLink}>
            {t('page.dashboard.openMyDay')}
          </Link>
        </div>
        <div className={dash.pulseRow}>
          <Link to="/quotations" className={dash.pulseLink}>
            <div className={dash.pulseValue}>{openQuotes}</div>
            <div className={dash.pulseLabel}>{t('page.dashboard.openQuotes')}</div>
          </Link>
          <Link to="/crm" className={dash.pulseLink}>
            <div className={dash.pulseValue}>{openPipeline}</div>
            <div className={dash.pulseLabel}>{t('page.dashboard.openDeals')}</div>
          </Link>
          <Link to="/invoices" className={dash.pulseLink}>
            <div className={dash.pulseValue}>{pendingInvoices}</div>
            <div className={dash.pulseLabel}>{t('page.dashboard.pendingInvoices')}</div>
          </Link>
          <Link to="/crm?follow=Due&owner=me" className={dash.pulseLink}>
            <div className={dash.pulseValue}>{overdueFollowUps}</div>
            <div className={dash.pulseLabel}>{t('page.dashboard.overdueFollowUps')}</div>
          </Link>
        </div>
        <div className={dash.stageRow}>
          {PIPELINE_STAGES.map((s) => (
            <Link key={s} to={`/crm?stage=${encodeURIComponent(s)}`} className={dash.stageChip}>
              <span className={dash.stageLabel}>{s}</span>
              <span className={dash.stageCount}>{pipelineCounts[s] || 0}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={dash.section} aria-label="Needs attention">
        <button
          type="button"
          className={dash.attentionToggle}
          aria-expanded={attentionOpen}
          onClick={() => setAttentionOpen((v) => !v)}
        >
          <span className={dash.attentionToggleCopy}>
            <span className={dash.sectionTitle}>Needs attention</span>
            <span className={dash.attentionHint}>
              Leads, watchdog, next steps, modules, renewals
            </span>
          </span>
          {attentionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {attentionOpen ? (
          <div className={dash.attentionStack}>
            <NewLeadsCard />
            <WatchdogCard />
            <NoNextStepCard />
            <ModuleAlertsCard />
            <CtrmRenewalsCard />
            {domainAlerts.length > 0 || ownedDomains.length > 0 ? (
              <div className={dash.surface}>
                <h3 className={dash.surfaceTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Globe size={16} /> Domain renewals
                </h3>
                {domainAlerts.length === 0 ? (
                  <p style={{ color: colors.muted2, fontSize: 13, margin: 0, lineHeight: 1.45 }}>
                    {ownedDomains.length} domain{ownedDomains.length === 1 ? '' : 's'} tracked — none
                    expiring in the next 90 days.
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, color: colors.muted, fontSize: 13, lineHeight: 1.55 }}>
                    {domainAlerts.slice(0, 8).map((a) => (
                      <li key={a.id} style={{ marginBottom: 6 }}>
                        <strong style={{ color: a.severity === 'overdue' ? colors.danger : colors.text }}>
                          {a.domainName}
                        </strong>{' '}
                        · {domainAlertLabel(a)}
                        {a.registrar ? ` · ${a.registrar}` : ''}
                        {a.autoRenew ? ' · auto-renew' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <p style={{ margin: '12px 0 0', fontSize: 12 }}>
                  <Link to="/domains" style={{ color: colors.accent }}>
                    Manage domains
                  </Link>
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={dash.section} aria-label="Recent documents">
        <div className={dash.sectionHead}>
          <h2 className={dash.sectionTitle}>Recent</h2>
        </div>
        <div className={dash.dual}>
          <div className={dash.surface}>
            <div className={dash.sectionHead}>
              <h3 className={dash.surfaceTitle} style={{ margin: 0 }}>
                Quotes
              </h3>
              <Link to="/quotations" className={dash.sectionLink}>
                All
              </Link>
            </div>
            {recentQuotes.length === 0 ? (
              <EmptyState title="No quotes yet" subtitle="New quotations will appear here." />
            ) : (
              <ul className={dash.docList}>
                {recentQuotes.map((q) => (
                  <li key={q.id}>
                    <Link to={`/quotations?ref=${encodeURIComponent(q.reference_number || q.id)}`} className={dash.docRow}>
                      <span className={dash.docMuted}>
                        {q.date ? format(parseISO(q.date.slice(0, 10)), 'dd MMM') : '—'}
                      </span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.client || '—'}
                      </span>
                      <span className={dash.docAmount}>{formatMoney(q.amount)}</span>
                      <StatusPill status={q.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={dash.surface}>
            <div className={dash.sectionHead}>
              <h3 className={dash.surfaceTitle} style={{ margin: 0 }}>
                Invoices
              </h3>
              <Link to="/invoices" className={dash.sectionLink}>
                All
              </Link>
            </div>
            {recentInvoices.length === 0 ? (
              <EmptyState title="No invoices yet" subtitle="New invoices will appear here." />
            ) : (
              <ul className={dash.docList}>
                {recentInvoices.map((inv) => (
                  <li key={inv.id}>
                    <div className={dash.docRow}>
                      <span className={dash.docMuted}>
                        {inv.date ? format(parseISO(inv.date.slice(0, 10)), 'dd MMM') : '—'}
                      </span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.client || '—'}
                      </span>
                      <span className={dash.docAmount}>{formatMoney(inv.amount)}</span>
                      <StatusPill status={inv.payment_status || inv.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className={dash.section} aria-label="Team and divisions">
        <div className={dash.sectionHead}>
          <h2 className={dash.sectionTitle}>Team &amp; divisions</h2>
        </div>
        <div className={dash.dual}>
          <div className={dash.surface}>
            <h3 className={dash.surfaceTitle}>Owner workload</h3>
            {ownerWorkload.length === 0 ? (
              <EmptyState title="No CRM owners yet" subtitle="Assign sales owners on CRM companies." />
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Owner</th>
                      <th style={thStyle}>Open</th>
                      <th style={thStyle}>Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownerWorkload.map((r) => (
                      <tr key={r.owner}>
                        <td style={tdStyle}>
                          <Link
                            to={`/crm?owner=${encodeURIComponent(r.owner)}`}
                            style={{ color: colors.accent, textDecoration: 'none' }}
                          >
                            {r.owner}
                          </Link>
                        </td>
                        <td style={tdStyle}>{r.open}</td>
                        <td style={{ ...tdStyle, color: r.overdue ? colors.danger : colors.muted }}>
                          {r.overdue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className={dash.surface}>
            <h3 className={dash.surfaceTitle}>By division</h3>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Division</th>
                    <th style={thStyle}>Open</th>
                    <th style={thStyle}>Win</th>
                    <th style={thStyle}>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {divisionBreakdown.map((d) => (
                    <tr key={d.code}>
                      <td style={tdStyle}>
                        <span style={{ color: colors.muted2, marginRight: 6 }}>{d.code}</span>
                        {d.brand}
                      </td>
                      <td style={tdStyle}>{d.openCount}</td>
                      <td style={tdStyle}>{d.winRate === null ? '—' : `${Math.round(d.winRate * 100)}%`}</td>
                      <td style={{ ...tdStyle, color: d.outstandingAmount ? colors.warn : undefined }}>
                        {formatMoney(d.outstandingAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={dash.footNote}>
              Win rate = awarded ÷ (awarded + not awarded + expired). Outstanding is unpaid invoiced amount.
            </p>
          </div>
        </div>
      </section>

      {showCompanyVault ? (
        <section className={dash.section} aria-label="Company vault">
          <div className={dash.sectionHead}>
            <h2 className={dash.sectionTitle}>Company</h2>
            <Link to="/settings" className={dash.sectionLink}>
              Settings
            </Link>
          </div>
          <div className={dash.dual}>
            <div className={dash.surface}>
              <h3 className={dash.surfaceTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={16} /> Document expiry
              </h3>
              {docAlerts.length === 0 ? (
                <p style={{ color: colors.muted2, fontSize: 13, margin: 0, lineHeight: 1.45 }}>
                  No trade license / VAT certificates expiring in the next 60 days.
                </p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, color: colors.muted, fontSize: 13, lineHeight: 1.55 }}>
                  {docAlerts.map((a) => (
                    <li key={a.id} style={{ marginBottom: 6 }}>
                      <strong style={{ color: a.severity === 'overdue' ? colors.danger : colors.text }}>
                        {a.title}
                      </strong>{' '}
                      · {a.categoryLabel} · {companyDocAlertLabel(a)}
                      {a.driveUrl ? (
                        <>
                          {' '}
                          ·{' '}
                          <a href={a.driveUrl} target="_blank" rel="noreferrer" style={{ color: colors.accent }}>
                            Open
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={dash.surface}>
              <h3 className={dash.surfaceTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderOpen size={16} /> Vault
              </h3>
              <p style={{ color: colors.muted2, fontSize: 13, margin: '0 0 10px', lineHeight: 1.45 }}>
                Trade license, VAT certificate, and other company papers.
              </p>
              {companyVaultRoot ? (
                <p style={{ margin: '0 0 10px', fontSize: 13 }}>
                  <a href={companyVaultRoot} target="_blank" rel="noreferrer" style={{ color: colors.accent }}>
                    Open company Google Drive folder
                  </a>
                </p>
              ) : (
                <p style={{ color: colors.muted2, fontSize: 12, margin: '0 0 10px' }}>
                  Connect Google Drive in Settings for a quick link here.
                </p>
              )}
              {companyDocs.length === 0 ? (
                <p style={{ color: colors.muted2, fontSize: 13, margin: 0 }}>No documents linked yet.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
                  {companyDocs.slice(0, 6).map((d) => (
                    <li key={d.id}>
                      {d.drive_url ? (
                        <a href={d.drive_url} target="_blank" rel="noreferrer" style={{ color: colors.accent }}>
                          {d.title || d.category}
                        </a>
                      ) : (
                        d.title || d.category
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className={dash.section} aria-label="Mail">
        <div className={dash.sectionHead}>
          <h2 className={dash.sectionTitle}>Mail</h2>
        </div>
        <ZohoInboxPanel crmEntries={crm} />
      </section>
    </div>
  )
}
