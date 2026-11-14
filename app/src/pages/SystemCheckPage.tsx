import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import EmptyState from '../components/EmptyState'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import { isAuditAvailable } from '../lib/auditLog'
import type { OutboxHealth } from '../lib/eventOutboxWorker'
import { summarise, type CheckState, type FunctionCheck } from '../lib/systemCheck'
import { loadOutboxHealth, runSystemCheck } from '../lib/systemCheckStore'
import {
  cardStyle,
  colors,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const STATE_COLOR: Record<CheckState, string> = { green: colors.success, amber: colors.warn, red: colors.danger }
const STATE_LABEL: Record<CheckState, string> = { green: 'OK', amber: 'Check', red: 'Down' }

export default function SystemCheckPage() {
  const { t } = useI18n()
  const { userRole } = useAuth()
  const [checks, setChecks] = useState<FunctionCheck[]>([])
  const [outbox, setOutbox] = useState<OutboxHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState('')
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)

  const allowed = can(userRole, 'system.check')

  const load = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      const [nextChecks, nextOutbox] = await Promise.all([runSystemCheck(), loadOutboxHealth()])
      setChecks(nextChecks)
      setOutbox(nextOutbox)
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
      <div className={docsStyles.page}>
        <EmptyState title="Admins only" subtitle="Ask an admin if you need to see the system check." />
      </div>
    )
  }
  if (!isAuditAvailable()) {
    return (
      <div className={docsStyles.page}>
        <EmptyState icon={<Activity size={28} />} title="System check runs in cloud mode" subtitle="Connect Supabase in Settings." />
      </div>
    )
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.admin.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.systemCheck.title')}</h1>
          <p className={docsStyles.subtitle}>
            {t('page.systemCheck.subtitleLead')}{' '}
            <Link to="/app-errors" style={{ color: colors.accent }}>
              {t('page.systemCheck.appErrors')}
            </Link>
            {t('page.systemCheck.subtitleTrail')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'rgba(255,255,255,0.08)' }}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? 'Checking' : 'Check again'}
          </button>
          {checkedAt && !loading ? (
            <span style={{ fontSize: 13, color: colors.muted }}>
              {counts.green} OK, {counts.amber} to check, {counts.red} down, at {format(checkedAt, 'HH:mm')}
            </span>
          ) : null}
        </div>
      </header>
      {problem ? (
        <div style={{ ...cardStyle, color: colors.danger }}>{problem}</div>
      ) : (
        <>
          {outbox ? (
            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: STATE_COLOR[outbox.state] }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: STATE_COLOR[outbox.state] }} />
                  Outbox {STATE_LABEL[outbox.state]}
                </span>
                <span style={{ fontSize: 13, color: colors.muted }}>{outbox.reason}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: colors.muted2 }}>
                Pending {outbox.counts.pending} · Processing {outbox.counts.processing} · Failed {outbox.counts.failed}
                {outbox.hubspotNudgeAt ? ` · HubSpot nudge ${format(parseISO(outbox.hubspotNudgeAt), 'd MMM, HH:mm')}` : ''}
                {outbox.digestSignalAt ? ` · Digest signal ${format(parseISO(outbox.digestSignalAt), 'd MMM, HH:mm')}` : ''}
              </p>
            </div>
          ) : null}
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
        </>
      )}
    </div>
  )
}
