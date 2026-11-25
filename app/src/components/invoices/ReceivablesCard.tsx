import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Hourglass } from 'lucide-react'
import { agingSummary, AGING_BUCKETS, type AgingTotals } from '../../lib/arChase'
import { loadAgingData, syncChaseTasks, type AgingData } from '../../lib/arChaseStore'
import { formatMoneyAmount } from '../../lib/currency'
import { cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/**
 * Dashboard: what is owed by age, invoices whose promised payment date has
 * passed (broken promises) and how many chase tasks are open.
 */
export default function ReceivablesCard({ canWork }: { canWork: boolean }) {
  const [data, setData] = useState<AgingData | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        let d = await loadAgingData()
        if (canWork && !d.setupMissing && (await syncChaseTasks(d).catch(() => 0))) d = await loadAgingData()
        if (live) setData(d)
      } catch {
        if (live) setData(null)
      }
    })()
    return () => {
      live = false
    }
  }, [canWork])

  if (!data) return null
  const summary = agingSummary(data.rows)
  const totals = Object.entries(summary.totals_by_currency) as [string, AgingTotals][]
  if (!totals.some(([, t]) => t.overdue > 0) && !summary.broken_promises.length) return null
  const openTasks = data.tasks.filter((t) => t.status === 'open' && data.rows.some((r) => r.invoice_id === t.invoice_id)).length

  return (
    <section aria-label="Receivables" style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Hourglass size={16} aria-hidden /> Overdue invoices
        </h2>
        <Link to="/receivables" style={{ color: colors.accentText, fontSize: 13 }}>
          Aging and chasing{openTasks ? ` (${openTasks} task${openTasks === 1 ? '' : 's'} open)` : ''}
        </Link>
      </div>

      {summary.broken_promises.length ? (
        <div role="alert" style={{ margin: '0 0 12px', fontSize: 13, color: colors.danger }}>
          <strong style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <AlertTriangle size={14} aria-hidden /> Broken promise{summary.broken_promises.length === 1 ? '' : 's'}:
          </strong>{' '}
          {summary.broken_promises
            .map((p) => `${p.reference} ${p.client} (${formatMoneyAmount(p.balance, p.currency)}, promised ${p.promised_date})`)
            .join('; ')}
        </div>
      ) : null}

      {totals.map(([cur, t]) => (
        <div key={cur} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <strong style={{ color: colors.danger }}>{formatMoneyAmount(t.overdue, cur)}</strong>{' '}
            <span style={{ color: colors.muted }}>overdue of {formatMoneyAmount(t.total, cur)} owing</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: 6 }}>
            {AGING_BUCKETS.map((b) => (
              <div key={b.key} style={{ fontSize: 12 }}>
                <div style={{ color: colors.muted }}>{b.label}</div>
                <div style={{ fontWeight: 600 }}>{formatMoneyAmount(t[b.key], cur)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {summary.next_chase_actions.length ? (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
          {summary.next_chase_actions.slice(0, 5).map((a) => (
            <li key={a.invoice_id}>
              <strong>{a.reference}</strong> {a.client}, {a.days_overdue} days: {a.next_action}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
