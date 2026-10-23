import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { addMonths, format, parseISO } from 'date-fns'
import { useSettings } from '../contexts/SettingsContext'
import { getAccount } from '../lib/accountsStore'
import {
  BUILD_STAGE_STATUSES,
  TIME_CATEGORIES,
  buildProgress,
  calculateOverage,
  hoursInMonth,
  monthKey,
  monthLabel,
  orderedStages,
  ratesFromSettings,
  stageLabel,
} from '../lib/delivery'
import {
  currentContract,
  listContracts,
  listPackages,
  listRequirements,
  listStages,
  listTimeEntries,
  listUsage,
} from '../lib/deliveryStore'
import { errorMessage } from '../lib/errors'
import { formatAED } from '../lib/money'
import type {
  Account,
  BuildStage,
  Contract,
  DeliveryPackage,
  Requirement,
  TimeEntry,
  UsageRecord,
} from '../lib/types'
import styles from './ClientReportPage.module.css'

/** Printable monthly client report: hours, usage, tickets, build status, next month plan. */
export default function ClientReportPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { settings } = useSettings()
  const rates = useMemo(() => ratesFromSettings(settings), [settings])
  const month = monthKey(searchParams.get('month') ? `${searchParams.get('month')}-01` : new Date())
  const [account, setAccount] = useState<Account | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [pkg, setPkg] = useState<DeliveryPackage | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [usage, setUsage] = useState<UsageRecord[]>([])
  const [stages, setStages] = useState<BuildStage[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [planEdits, setPlanEdits] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const acc = await getAccount(id)
        if (!alive) return
        setAccount(acc)
        if (!acc) return
        const [c, p, t, u, s, r] = await Promise.all([
          listContracts(id),
          listPackages(),
          listTimeEntries(id),
          listUsage(id),
          listStages(id),
          listRequirements(id),
        ])
        if (!alive) return
        const cur = currentContract(c)
        setContract(cur)
        setPkg(p.find((x) => x.id === cur?.package_id) ?? null)
        setEntries(t)
        setUsage(u)
        setStages(s)
        setRequirements(r)
      } catch (e) {
        setError(errorMessage(e, 'Could not load the report'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id])

  const monthEntries = entries.filter((e) => monthKey(e.date) === month)
  const totalHours = hoursInMonth(entries, month)
  const usageRow = usage.find((u) => monthKey(u.month) === month)
  const overage = pkg && usageRow ? calculateOverage(usageRow, pkg, rates) : null
  const progress = buildProgress(stages)
  const openItems = requirements.filter((r) => r.status === 'open' || r.status === 'agreed')
  const nextMonth = monthLabel(monthKey(addMonths(parseISO(month), 1)))

  const defaultPlan = [
    ...(progress.done < progress.total ? [`Move the build forward: ${progress.current}.`] : []),
    ...openItems.slice(0, 6).map((r) => `${r.title}${r.is_change_request ? ' (change request)' : ''}`),
  ]
    .map((l) => `- ${l}`)
    .join('\n')
  const plan = planEdits[month] ?? defaultPlan

  if (loading) return <div className={styles.page}>Loading report…</div>
  if (error || !account) {
    return (
      <div className={styles.page}>
        <div className={styles.sheet}>
          {error || 'This account does not exist, or it is not assigned to you.'}{' '}
          <Link to="/accounts">Back to accounts</Link>
        </div>
      </div>
    )
  }

  const byCategory = TIME_CATEGORIES.map((c) => ({
    ...c,
    hours: Math.round(monthEntries.filter((e) => e.category === c.value).reduce((s, e) => s + Number(e.hours), 0) * 100) / 100,
  })).filter((c) => c.hours > 0)

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to={`/accounts/${account.id}`}>Back to {account.name}</Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="month"
            aria-label="Report month"
            value={month.slice(0, 7)}
            onChange={(e) => e.target.value && setSearchParams({ month: e.target.value }, { replace: true })}
          />
          <button type="button" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>
      </div>

      <article className={styles.sheet}>
        <div className={styles.muted} style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {settings.companyName || 'Red Reach Middle East FZE'}, monthly report
        </div>
        <h1>{account.name}</h1>
        <div className={styles.muted}>
          {monthLabel(month)}
          {pkg ? `, ${pkg.name} package` : ''}
          {account.reference ? `, ${account.reference}` : ''}
        </div>

        <h2>Hours</h2>
        <p style={{ margin: '0 0 8px' }}>
          <strong>{totalHours}h</strong> worked this month
          {pkg ? ` against a ${pkg.target_hours}h monthly target.` : '.'}
        </p>
        {byCategory.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Work</th>
                <th className={styles.num}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.value}>
                  <td>{c.label}</td>
                  <td className={styles.num}>{c.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>No hours logged for this month.</p>
        )}

        <h2>Usage</h2>
        {usageRow ? (
          <table className={styles.table}>
            <tbody>
              <tr>
                <td>WhatsApp marketing conversations</td>
                <td className={styles.num}>{usageRow.whatsapp_marketing_count.toLocaleString('en-AE')}</td>
              </tr>
              <tr>
                <td>WhatsApp service and utility conversations</td>
                <td className={styles.num}>{usageRow.whatsapp_service_count.toLocaleString('en-AE')}</td>
              </tr>
              {overage ? (
                <tr>
                  <td>Included in your plan</td>
                  <td className={styles.num}>{overage.includedWhatsapp.toLocaleString('en-AE')}</td>
                </tr>
              ) : null}
              {overage ? (
                <tr>
                  <td>
                    <strong>Usage above plan (excl. VAT)</strong>
                  </td>
                  <td className={styles.num}>
                    <strong>{formatAED(overage.totalAed)}</strong>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>No usage recorded for this month.</p>
        )}

        <h2>Support</h2>
        <p className={styles.muted}>Tickets resolved: not tracked yet. This will fill in once the support desk is live.</p>

        <h2>Build status</h2>
        <p style={{ margin: '0 0 8px' }}>
          {progress.done === progress.total
            ? 'Your system is live.'
            : `${progress.done} of ${progress.total} stages done. Current stage: ${progress.current}.`}
        </p>
        <table className={styles.table}>
          <tbody>
            {orderedStages(stages).map((s) => (
              <tr key={s.stage}>
                <td>{stageLabel(s.stage)}</td>
                <td className={styles.num}>{BUILD_STAGE_STATUSES.find((o) => o.value === s.status)?.label}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Plan for {nextMonth}</h2>
        <textarea
          className={styles.plan}
          aria-label="Next month plan"
          value={plan}
          onChange={(e) => setPlanEdits((p) => ({ ...p, [month]: e.target.value }))}
        />
        <div className={styles.planPrint}>{plan || 'To be agreed at the monthly check in.'}</div>

        {contract ? (
          <p className={styles.muted} style={{ fontSize: 12, marginTop: 28 }}>
            Contract term {contract.term_start ? format(parseISO(contract.term_start), 'd MMM yyyy') : ''} to{' '}
            {contract.term_end ? format(parseISO(contract.term_end), 'd MMM yyyy') : ''}. Prices exclude 5% VAT.
          </p>
        ) : null}
      </article>
    </div>
  )
}
