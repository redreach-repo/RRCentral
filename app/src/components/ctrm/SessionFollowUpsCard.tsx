import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { sessionKindLabel } from '../../lib/ctrmSessions'
import { loadFollowUpsDue, markFollowUpDone } from '../../lib/ctrmSessionsStore'
import { errorMessage } from '../../lib/errors'
import { roleAtLeast } from '../../lib/permissions'
import type { CtrmSession } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** My Day: CTRM Next demo and training follow ups due today or earlier. */
export default function SessionFollowUpsCard() {
  const { user, appUserId, userRole } = useAuth()
  const { showToast } = useToast()
  const show = roleAtLeast(userRole, 'sales') || userRole === 'staff'
  const [rows, setRows] = useState<(CtrmSession & { accountName: string })[] | null>(null)

  useEffect(() => {
    if (!show) return
    let alive = true
    loadFollowUpsDue()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [show])

  if (!show || !rows || rows.length === 0) return null

  async function done(s: CtrmSession) {
    try {
      await markFollowUpDone(s, { appUserId, email: user?.email || '' })
      setRows((r) => (r || []).filter((x) => x.id !== s.id))
    } catch (e) {
      showToast(errorMessage(e, 'Could not save that'), 'error')
    }
  }

  return (
    <section style={{ ...cardStyle, margin: '12px 0' }}>
      <h2 style={{ ...sectionTitleStyle, marginTop: 0 }}>CTRM Next follow ups due ({rows.length})</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {rows.map((s) => (
          <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
            <span>
              <Link to={`/accounts/${s.account_id}`}>{s.accountName}</Link>: after the {sessionKindLabel(s.kind).toLowerCase()} on{' '}
              {format(parseISO(s.session_date), 'd MMM')}
              <span style={{ color: colors.muted }}> (due {format(parseISO(String(s.follow_up_due)), 'd MMM')})</span>
            </span>
            <button type="button" style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => void done(s)}>
              Done
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
