import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import { isAuditAvailable } from '../lib/auditLog'
import { summarise, type CheckState, type FunctionCheck } from '../lib/systemCheck'
import { runSystemCheck } from '../lib/systemCheckStore'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
} from '../lib/uiStyles'

const STATE_COLOR: Record<CheckState, string> = { green: colors.success, amber: colors.warn, red: colors.danger }
const STATE_LABEL: Record<CheckState, string> = { green: 'OK', amber: 'Check', red: 'Down' }

export default function SystemCheckPage() {
  const { userRole } = useAuth()
  const [checks, setChecks] = useState<FunctionCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState('')
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)

  const allowed = can(userRole, 'system.check')

  const load = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      setChecks(await runSystemCheck())
      setCheckedAt(new Date())
    } catch (e) {
      setProblem(errorMessage(e, 'Could not run the check'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (allowed && isAuditAvailable()) void load()
  }, [allowed, load])

  const counts = useMemo(() => summarise(checks), [checks])

  if (!allowed) {
    return (
      <div style={pageStyle}>
        <EmptyState title="Admins only" subtitle="Ask an admin if you need to see the system check." />
      </div>
    )
  }
  if (!isAuditAvailable()) {
    return (
      <div style={pageStyle}>
        <EmptyState icon={<Activity size={28} />} title="System check runs in cloud mode" subtitle="Connect Supabase in Settings." />
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>System check</h1>
      <p style={pageSubtitleStyle}>
        Every server function gets a harmless ping (it does not send, import or change anything), next to its last failure.
        Each row names its test in docs/LIVE_TEST.md. Full error details are on <Link to="/app-errors" style={{ color: colors.accent }}>App errors</Link>.
      </p>
      <div style={toolbarStyle}>
        <button type="button" style={buttonSecondaryStyle} disabled={loading} onClick={() => void load()}>
          {loading ? 'Checking' : 'Check again'}
        </button>
        {checkedAt && !loading ? (
          <span style={{ fontSize: 13, color: colors.muted }}>
            {counts.green} OK, {counts.amber} to check, {counts.red} down, at {format(checkedAt, 'HH:mm')}
          </span>
        ) : null}
      </div>
      {problem ? (
        <div style={{ ...cardStyle, color: colors.danger }}>{problem}</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>State</th>
                <th style={thStyle}>Function</th>
                <th style={thStyle}>Why</th>
                <th style={thStyle}>Last error</th>
                <th style={thStyle}>Live test</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.fn.name}>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: STATE_COLOR[c.state] }}>
                      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: STATE_COLOR[c.state] }} />
                      {STATE_LABEL[c.state]}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{c.fn.feature}</div>
                    <div style={{ fontSize: 12, color: colors.muted2 }}>{c.fn.name}</div>
                  </td>
                  <td style={tdStyle}>{c.reason}</td>
                  <td style={{ ...tdStyle, maxWidth: 360, wordBreak: 'break-word' }}>
                    {c.lastError ? (
                      <>
                        <div>{c.lastError.message}</div>
                        <div style={{ fontSize: 12, color: colors.muted2 }}>{format(parseISO(c.lastError.created_at), 'd MMM, HH:mm')}</div>
                      </>
                    ) : (
                      <span style={{ color: colors.muted2 }}>None in 30 days</span>
                    )}
                  </td>
                  <td style={tdStyle}>Test {c.fn.liveTest}</td>
                </tr>
              ))}
              {loading && !checks.length ? (
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    Checking every function…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
