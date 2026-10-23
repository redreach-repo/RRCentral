import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { visibleAccounts } from '../lib/accounts'
import { listAccounts } from '../lib/accountsStore'
import { summaryText, weeklySummary } from '../lib/ctrm'
// Commission is deliberately not loaded on this page: the summary goes to CTRM Next.
import { listDeals, listStageChanges } from '../lib/ctrmStore'
import { errorMessage } from '../lib/errors'
import type { Account, CtrmDeal, CtrmStageChange } from '../lib/types'
import styles from './ClientReportPage.module.css'

/** Weekly pipeline update for CTRM Next, to copy or print. No commission or fees. */
export default function CtrmSummaryPage() {
  const { userRole, appUserId } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const day = searchParams.get('week') || format(new Date(), 'yyyy-MM-dd')
  const [deals, setDeals] = useState<CtrmDeal[]>([])
  const [changes, setChanges] = useState<CtrmStageChange[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [d, c, { rows }] = await Promise.all([listDeals(), listStageChanges(), listAccounts()])
        if (!alive) return
        setDeals(d)
        setChanges(c)
        setAccounts(rows)
      } catch (e) {
        if (alive) setError(errorMessage(e, 'Could not load the pipeline'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const summary = useMemo(() => {
    const mine = new Map(visibleAccounts(accounts, userRole, appUserId).map((a) => [a.id, a.name]))
    const shown = deals.filter((d) => mine.has(d.account_id))
    const nameById = new Map(shown.map((d) => [d.id, mine.get(d.account_id) ?? 'Unknown company']))
    return weeklySummary(shown, changes, (id) => nameById.get(id) ?? 'Unknown company', parseISO(day))
  }, [deals, changes, accounts, userRole, appUserId, day])

  async function copy() {
    const text = summaryText(summary)
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Copied. Paste it into an email or WhatsApp.')
    } catch {
      setCopied('Copy did not work here. Select the text on the page instead.')
    }
  }

  if (loading) return <div className={styles.page}>Loading summary…</div>
  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.sheet}>
          {error} <Link to="/ctrm">Back to the pipeline</Link>
        </div>
      </div>
    )
  }

  const nice = (iso: string) => format(parseISO(iso), 'd MMM yyyy')
  const list = (items: string[]) => (items.length ? items.join(', ') : 'None')

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to="/ctrm">Back to the pipeline</Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14 }}>
            Week of{' '}
            <input
              type="date"
              aria-label="Any day in the week"
              value={day}
              onChange={(e) => e.target.value && setSearchParams({ week: e.target.value }, { replace: true })}
            />
          </label>
          <button type="button" onClick={() => void copy()}>
            Copy as text
          </button>
          <button type="button" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>
      </div>
      {copied ? (
        <p className={styles.toolbar} style={{ fontSize: 13 }} role="status">
          {copied}
        </p>
      ) : null}

      <article className={styles.sheet}>
        <div className={styles.muted} style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Red Reach for CTRM Next, weekly pipeline
        </div>
        <h1>
          Week of {nice(summary.weekStart)} to {nice(summary.weekEnd)}
        </h1>

        <h2>Deals by stage</h2>
        <table className={styles.table}>
          <tbody>
            {summary.byStage.map((b) => (
              <tr key={b.stage}>
                <td>{b.label}</td>
                <td className={styles.num}>{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>This week</h2>
        <table className={styles.table}>
          <tbody>
            <tr>
              <td>New companies</td>
              <td>
                {summary.newThisWeek.length
                  ? summary.newThisWeek.map((n) => `${n.name} (${n.region})`).join(', ')
                  : 'None'}
              </td>
            </tr>
            <tr>
              <td>Intro calls booked</td>
              <td>{list(summary.callsBooked)}</td>
            </tr>
            <tr>
              <td>Demos done</td>
              <td>{list(summary.demosDone)}</td>
            </tr>
            <tr>
              <td>Signed</td>
              <td>{list(summary.signed)}</td>
            </tr>
          </tbody>
        </table>

        <h2>Next steps</h2>
        {summary.nextSteps.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Company</th>
                <th>Stage</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {summary.nextSteps.map((n) => (
                <tr key={`${n.name}-${n.date}-${n.action}`}>
                  <td>{format(parseISO(n.date), 'd MMM')}</td>
                  <td>{n.name}</td>
                  <td>{n.stage}</td>
                  <td>{n.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>No open deals with a next step.</p>
        )}
      </article>
    </div>
  )
}
