import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { listAccounts } from '../../lib/accountsStore'
import { isUrgentRenewal, renewalText, upcomingRenewals, type RenewalInfo } from '../../lib/ctrmRenewals'
import { listTerms } from '../../lib/ctrmTermsStore'
import { exportListCsv } from '../../lib/listIo'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** Dashboard: CTRM Next clients renewing in the next 90 days (or just passed). Hidden when there are none. */
export default function CtrmRenewalsCard() {
  const [rows, setRows] = useState<(RenewalInfo & { name: string })[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([listTerms(), listAccounts()])
      .then(([terms, accounts]) => {
        const names = new Map(accounts.rows.map((a) => [a.id, a.name]))
        if (alive) setRows(upcomingRenewals(terms).map((r) => ({ ...r, name: names.get(r.accountId) ?? 'CTRM Next client' })))
      })
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [])

  if (!rows.length) return null
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <CalendarClock size={18} /> CTRM Next renewals
        </h2>
        <button
          type="button"
          style={buttonSecondaryStyle}
          onClick={() => {
            exportListCsv(
              'ctrm-renewals.csv',
              ['account', 'renewal_date', 'days', 'stage', 'notice_by', 'notice_days_left', 'summary'],
              rows.map((r) => ({
                account: r.name,
                renewal_date: r.renewal,
                days: r.days,
                stage: r.stage || '',
                notice_by: r.noticeBy || '',
                notice_days_left: r.noticeDaysLeft ?? '',
                summary: renewalText(r),
              })),
            )
          }}
        >
          Export CSV
        </button>
      </div>
      <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
        {rows.map((r) => (
          <li key={r.accountId} style={{ marginBottom: 6, color: colors.muted }}>
            <Link to={`/accounts/${r.accountId}`} style={{ color: isUrgentRenewal(r) ? colors.danger : colors.text, fontWeight: 600 }}>
              {r.name}
            </Link>{' '}
            · {r.stage === 'passed' ? 'renewal passed' : `${r.stage} day reminder`} · {renewalText(r)}
          </li>
        ))}
      </ul>
    </div>
  )
}
