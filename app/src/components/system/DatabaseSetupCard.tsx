import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { cardStyle, colors, tableStyle, tableWrapStyle, tdStyle, thStyle } from '../../lib/uiStyles'
import {
  countDbSetup,
  migrationUrl,
  sortDbSetup,
  type DbSetupResult,
  type DbSetupState,
} from '../../lib/dbSetup/dbSetupCheck'
import { runDbSetupCheck } from '../../lib/dbSetup/dbSetupStore'

const STATE_COLOR: Record<DbSetupState, string> = {
  done: colors.success,
  missing: colors.danger,
  error: colors.warn,
  unknown: colors.muted2,
}
const STATE_LABEL: Record<DbSetupState, string> = {
  done: 'On live',
  missing: 'To run',
  error: 'Check',
  unknown: 'Not visible',
}

/**
 * Setup status for the database: which updates (migration files) are on live.
 * Read only. Shows what is still to run, oldest first, so it can be ticked off.
 */
export default function DatabaseSetupCard() {
  const [results, setResults] = useState<DbSetupResult[]>([])
  const [loading, setLoading] = useState(false)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setResults(sortDbSetup(await runDbSetupCheck()))
      setCheckedAt(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => countDbSetup(results), [results])
  const visible = useMemo(
    () => (showAll ? results : results.filter((r) => r.state === 'missing' || r.state === 'error')),
    [results, showAll],
  )
  const checkable = counts.done + counts.missing + counts.error

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-labelledby="db-setup-title">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 id="db-setup-title" style={{ margin: 0, fontSize: 17 }}>
          Database updates
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {checkedAt && !loading ? (
            <span style={{ fontSize: 13, color: colors.muted }}>
              {counts.done} of {checkable} on live, {counts.missing} to run, at {format(checkedAt, 'HH:mm')}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}
          >
            {showAll ? 'Show only to run' : 'Show all'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}
          >
            {loading ? 'Checking' : 'Check again'}
          </button>
        </div>
      </div>
      <p style={{ margin: '8px 0 12px', fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>
        This only looks, it never changes data. Run the red ones in the Supabase SQL editor, oldest first, then press
        Check again. {counts.unknown} updates only change rules or functions and can't be seen from here.
      </p>
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>State</th>
              <th style={thStyle}>Update</th>
              <th style={thStyle}>Why</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.probe.migration}>
                <td style={tdStyle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: STATE_COLOR[r.state] }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: STATE_COLOR[r.state] }} />
                    {STATE_LABEL[r.state]}
                  </span>
                </td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{r.probe.label}</div>
                  <a
                    href={migrationUrl(r.probe.migration)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: colors.accentText, wordBreak: 'break-all' }}
                  >
                    {r.probe.migration}.sql
                  </a>
                </td>
                <td style={{ ...tdStyle, maxWidth: 420 }}>
                  <div>{r.reason}</div>
                  {r.probe.hold && r.state !== 'done' ? (
                    <div style={{ marginTop: 4, color: colors.warn, fontWeight: 600 }}>{r.probe.hold}</div>
                  ) : null}
                </td>
              </tr>
            ))}
            {loading && !results.length ? (
              <tr>
                <td style={tdStyle} colSpan={3}>
                  Checking the database…
                </td>
              </tr>
            ) : null}
            {!loading && results.length && !visible.length ? (
              <tr>
                <td style={tdStyle} colSpan={3}>
                  Every database update the app can see is on live.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
