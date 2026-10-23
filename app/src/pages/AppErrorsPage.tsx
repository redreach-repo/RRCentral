import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { Bug } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { can } from '../lib/permissions'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import { clearAppErrors, errorKey, groupErrors, listAppErrors, type AppError } from '../lib/errorReporting'
import { isAuditAvailable } from '../lib/auditLog'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  selectStyle,
  toolbarStyle,
} from '../lib/uiStyles'

const KIND_LABEL: Record<AppError['kind'], string> = {
  browser: 'Error',
  crash: 'Page crashed',
  function: 'Server function',
}

export default function AppErrorsPage() {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const [days, setDays] = useState(7)
  const [errors, setErrors] = useState<AppError[]>([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [open, setOpen] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      setErrors(await listAppErrors(subDays(new Date(), days).toISOString()))
    } catch (e) {
      setProblem(
        isMissingRelationError(e)
          ? 'Error monitoring is not set up yet. Run the item 14 SQL in Supabase.'
          : errorMessage(e, 'Could not load errors'),
      )
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    if (isAuditAvailable()) void load()
  }, [load])

  const groups = useMemo(() => groupErrors(errors), [errors])

  async function clearGroup(key: string) {
    const ids = errors.filter((e) => errorKey(e.message) === key).map((e) => e.id)
    try {
      await clearAppErrors(ids)
      showToast('Marked as fixed', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not clear'), 'error')
    }
  }

  if (!can(userRole, 'audit.read')) {
    return (
      <div style={pageStyle}>
        <EmptyState title="Admins only" subtitle="Ask an admin if you need to see app errors." />
      </div>
    )
  }
  if (!isAuditAvailable()) {
    return (
      <div style={pageStyle}>
        <EmptyState icon={<Bug size={28} />} title="Error monitoring runs in cloud mode" subtitle="Connect Supabase in Settings." />
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>App errors</h1>
      <p style={pageSubtitleStyle}>
        Errors people hit in RR Central, grouped by message, newest first. The daily digest email lists the last day's.
        Mark one as fixed once it is dealt with.
      </p>
      <div style={toolbarStyle}>
        <select style={selectStyle} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button type="button" style={buttonSecondaryStyle} disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading' : 'Refresh'}
        </button>
      </div>
      {problem ? (
        <div style={{ ...cardStyle, color: colors.danger }}>{problem}</div>
      ) : !loading && groups.length === 0 ? (
        <EmptyState icon={<Bug size={28} />} title="No errors in this period" />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {groups.map((g) => (
            <div key={g.key} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setOpen(open === g.key ? '' : g.key)}
                  style={{ background: 'none', border: 0, color: colors.text, textAlign: 'left', cursor: 'pointer', padding: 0, flex: '1 1 260px', minWidth: 0 }}
                >
                  <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{g.latest.message}</div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                    {KIND_LABEL[g.latest.kind]}, {g.count} {g.count === 1 ? 'time' : 'times'}, last{' '}
                    {format(parseISO(g.latest.created_at), 'd MMM, HH:mm')} on {g.latest.page || 'unknown page'}
                    {g.people.length ? `, ${g.people.join(', ')}` : ''}
                  </div>
                </button>
                <button type="button" style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }} onClick={() => void clearGroup(g.key)}>
                  Mark fixed
                </button>
              </div>
              {open === g.key && g.latest.detail ? (
                <pre style={{ fontSize: 11, color: colors.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 10, maxHeight: 300, overflow: 'auto' }}>
                  {g.latest.detail}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
