import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, MessagesSquare } from 'lucide-react'
import { isoDate, quoteFollowupSummary, type QuoteChaseTotals } from '../../lib/quoteChase'
import { loadQuoteChaseData, syncQuoteChaseTasks, type QuoteChaseData } from '../../lib/quoteChaseStore'
import { formatMoneyAmount } from '../../lib/currency'
import { cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/**
 * Dashboard: value of sent quotes waiting for an answer, quotes that need a
 * decision (accepted, client PO received, expired in the last 7 days,
 * declined, missed call-back) and how many follow-up tasks are due.
 */
export default function QuoteFollowUpCard({ canWork }: { canWork: boolean }) {
  const [data, setData] = useState<QuoteChaseData | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        let d = await loadQuoteChaseData()
        if (canWork && !d.setupMissing && (await syncQuoteChaseTasks(d).catch(() => 0))) d = await loadQuoteChaseData()
        if (live) setData(d)
      } catch {
        if (live) setData(null)
      }
    })()
    return () => {
      live = false
    }
  }, [canWork])

  if (!data || !data.rows.length) return null
  const today = new Date()
  const todayIso = isoDate(today)
  const summary = quoteFollowupSummary(data.rows, today, 5)
  const urgent = data.rows.filter((r) => ['award', 'expired', 'close', 'callback_missed'].includes(r.next_action.kind))
  const dueTasks = data.tasks.filter((t) => t.status === 'open' && t.due_on <= todayIso && data.rows.some((r) => r.quote_id === t.quotation_id)).length
  const totals = Object.entries(summary.totals_by_currency) as [string, QuoteChaseTotals][]

  return (
    <section aria-label="Quotes waiting for an answer" style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', gap: 8, alignItems: 'center' }}>
          <MessagesSquare size={16} aria-hidden /> Quotes waiting for an answer
        </h2>
        <Link to="/quote-followup" style={{ color: colors.accentText, fontSize: 13 }}>
          Quote follow-up{dueTasks ? ` (${dueTasks} follow-up${dueTasks === 1 ? '' : 's'} due)` : ''}
        </Link>
      </div>

      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <strong>{summary.waiting}</strong> quote{summary.waiting === 1 ? '' : 's'} waiting:{' '}
        {totals.map(([cur, t]) => formatMoneyAmount(t.total, cur)).join(' + ')}
        {summary.expiring_soon.length ? (
          <span style={{ color: colors.warn }}>
            {' '}
            · {summary.expiring_soon.length} expiring soon
          </span>
        ) : null}
      </div>

      {urgent.length ? (
        <div role="alert" style={{ fontSize: 13 }}>
          <strong style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: colors.warn }}>
            <AlertTriangle size={14} aria-hidden /> Needs you now:
          </strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.55 }}>
            {urgent.slice(0, 5).map((r) => (
              <li key={r.quote_id}>
                <strong>{r.reference}</strong> {r.client}: {r.next_action.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
