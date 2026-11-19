import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import DatabaseSetupCard from '../components/system/DatabaseSetupCard'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import { isAuditAvailable } from '../lib/auditLog'
import type { OutboxHealth } from '../lib/eventOutboxWorker'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { summarise, type CheckState, type FunctionCheck } from '../lib/systemCheck'
import { loadOutboxHealth, runSystemCheck } from '../lib/systemCheckStore'
import {
  cardStyle,
  colors,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const STATE_COLOR: Record<CheckState, string> = { green: colors.success, amber: colors.warn, red: colors.danger }
const STATE_LABEL: Record<CheckState, string> = { green: 'OK', amber: 'Check', red: 'Down' }
const SYSTEM_CHECK_CSV_HEADERS = [
  'state',
  'feature',
  'function',
  'reason',
  'last_error',
  'last_error_at',
  'live_test',
] as const

function parseCheckState(raw: string): CheckState {
  const v = raw.trim().toLowerCase()
  if (v === 'green' || v === 'ok') return 'green'
  if (v === 'red' || v === 'down') return 'red'
  if (v === 'amber' || v === 'check' || v === 'warn' || v === 'warning') return 'amber'
  return 'amber'
}

function fnKey(feature: string, name: string): string {
  return `${feature.trim().toLowerCase()}::${name.trim().toLowerCase()}`
}

export default function SystemCheckPage() {
  const { t } = useI18n()
  const { userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const [checks, setChecks] = useState<FunctionCheck[]>([])
  const [outbox, setOutbox] = useState<OutboxHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState('')
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [stateFilter, setStateFilter] = useState<CheckState | 'all'>('all')
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [importedChecks, setImportedChecks] = useState<FunctionCheck[] | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const allowed = can(userRole, 'system.check')
  const checkViewFilters = useMemo(() => ({ state: stateFilter }), [stateFilter])
  const boardChecks = csvFiltered && importedChecks ? importedChecks : checks
  const visibleChecks = useMemo(
    () => (stateFilter === 'all' ? boardChecks : boardChecks.filter((c) => c.state === stateFilter)),
    [boardChecks, stateFilter],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      const [nextChecks, nextOutbox] = await Promise.all([runSystemCheck(), loadOutboxHealth()])
      setChecks(nextChecks)
      setOutbox(nextOutbox)
      setCheckedAt(new Date())
      setCsvFiltered(false)
      setImportedChecks(null)
    } catch (e) {
      setProblem(errorMessage(e, 'Could not run the check'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (allowed && isAuditAvailable()) void load()
  }, [allowed, load])

  const counts = useMemo(() => summarise(boardChecks), [boardChecks])

  async function importSystemCheckCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byPair = new Map(checks.map((c) => [fnKey(c.fn.feature, c.fn.name), c] as const))
      const byName = new Map(checks.map((c) => [c.fn.name.trim().toLowerCase(), c] as const))
      const next: FunctionCheck[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const feature = String(row.feature || '').trim()
        const name = String(row.function || '').trim()
        if (!feature && !name) {
          skipped += 1
          return
        }
        const key = fnKey(feature || name, name || feature)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existing =
          (feature && name ? byPair.get(fnKey(feature, name)) : undefined) ||
          (name ? byName.get(name.toLowerCase()) : undefined)
        if (existing) {
          next.push(existing)
          matched += 1
          return
        }
        const state = parseCheckState(String(row.state || ''))
        const reason = String(row.reason || '').trim() || 'Imported from CSV'
        const lastErrorMsg = String(row.last_error || '').trim()
        const lastErrorAt = String(row.last_error_at || '').trim()
        next.push({
          fn: {
            name: name || `import-${idx}`,
            feature: feature || name || `Imported ${idx + 1}`,
            liveTest: String(row.live_test || '—').trim() || '—',
          },
          state,
          reason,
          lastError: lastErrorMsg
            ? {
                id: idx,
                kind: 'function',
                message: lastErrorMsg,
                detail: '',
                page: name || feature,
                user_email: '',
                user_agent: '',
                release: '',
                created_at: lastErrorAt || new Date().toISOString(),
              }
            : null,
        })
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching system check rows in CSV', 'error')
        return
      }
      setImportedChecks(next)
      setCsvFiltered(true)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : '']
        .filter(Boolean)
        .join(', ')
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} system check row(s) (${parts})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'System check CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

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
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importSystemCheckCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing || loading}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!visibleChecks.length}
            onClick={() => {
              exportListCsv(
                'system-check.csv',
                [...SYSTEM_CHECK_CSV_HEADERS],
                visibleChecks.map((c) => ({
                  state: c.state,
                  feature: c.fn.feature,
                  function: c.fn.name,
                  reason: c.reason,
                  last_error: c.lastError?.message || '',
                  last_error_at: c.lastError?.created_at || '',
                  live_test: c.fn.liveTest,
                })),
              )
              showToast('System check CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          {csvFiltered ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
              onClick={() => {
                setCsvFiltered(false)
                setImportedChecks(null)
              }}
            >
              Clear CSV filter
            </button>
          ) : null}
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

      <DatabaseSetupCard />

      <h2 style={{ margin: '8px 0 12px', fontSize: 17 }}>Server functions and secrets</h2>

      <SavedViewsBar
        moduleId="system_check"
        filters={checkViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => {
          const next = String(f.state || 'all')
          setStateFilter(next === 'green' || next === 'amber' || next === 'red' ? next : 'all')
        }}
        onToast={showToast}
        filtersEqual={(a, b) => String(a.state || 'all') === String(b.state || 'all')}
      />

      <div style={{ marginBottom: 12 }}>
        <select
          style={{ ...selectStyle, maxWidth: 200 }}
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as CheckState | 'all')}
        >
          <option value="all">All states</option>
          <option value="green">OK</option>
          <option value="amber">Check</option>
          <option value="red">Down</option>
        </select>
      </div>

      {csvFiltered ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
          Showing {boardChecks.length} function{boardChecks.length === 1 ? '' : 's'} from CSV (session only — Clear CSV
          filter resets).
        </p>
      ) : null}

      {problem ? (
        <div style={{ ...cardStyle, color: colors.danger }}>{problem}</div>
      ) : (
        <>
          {outbox && !csvFiltered ? (
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
                {visibleChecks.map((c) => (
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
                {loading && !boardChecks.length ? (
                  <tr>
                    <td style={tdStyle} colSpan={5}>
                      Checking every function…
                    </td>
                  </tr>
                ) : null}
                {!loading && boardChecks.length && !visibleChecks.length ? (
                  <tr>
                    <td style={tdStyle} colSpan={5}>
                      No functions match this state filter.
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
