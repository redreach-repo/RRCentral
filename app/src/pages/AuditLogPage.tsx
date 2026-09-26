import { Fragment, useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import {
  AUDIT_TABLE_LABELS,
  auditFieldChanges,
  auditSummary,
  isAuditAvailable,
  loadAuditLog,
  type AuditEntry,
} from '../lib/auditLog'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
} from '../lib/uiStyles'

const OPERATION_LABEL: Record<AuditEntry['operation'], string> = {
  INSERT: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
}

const OPERATION_COLOR: Record<AuditEntry['operation'], string> = {
  INSERT: '#3fb27f',
  UPDATE: '#d9a441',
  DELETE: '#e5484d',
}

export default function AuditLogPage() {
  const { userRole } = useAuth()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [table, setTable] = useState('')
  const [operation, setOperation] = useState<AuditEntry['operation'] | ''>('')
  const [actor, setActor] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setEntries(await loadAuditLog({ table, operation, actor: actor.trim(), limit: 300 }))
    } catch (e) {
      setError(
        isMissingRelationError(e)
          ? 'The audit trail is not set up yet. Apply supabase/migrations/20260926080000_audit_log.sql in Supabase.'
          : errorMessage(e, 'Could not load the audit log'),
      )
    } finally {
      setLoading(false)
    }
  }, [table, operation, actor])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(t)
  }, [load])

  if (userRole !== 'admin') {
    return (
      <div style={pageStyle}>
        <EmptyState title="Admins only" subtitle="Ask an admin if you need to see the audit trail." />
      </div>
    )
  }

  if (!isAuditAvailable()) {
    return (
      <div style={pageStyle}>
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title="Audit trail runs in cloud mode"
          subtitle="Connect Supabase in Settings. Changes are then recorded by the database for every user."
        />
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h2 style={pageTitleStyle}>Audit log</h2>
      <p style={pageSubtitleStyle}>
        Every create, change and delete on key records — who did it and what changed. Recorded by the
        database, so it cannot be edited from the app. Secrets are redacted.
      </p>

      <div style={toolbarStyle}>
        <select style={selectStyle} value={table} onChange={(e) => setTable(e.target.value)} aria-label="Record type">
          <option value="">All records</option>
          {Object.entries(AUDIT_TABLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={operation}
          onChange={(e) => setOperation(e.target.value as AuditEntry['operation'] | '')}
          aria-label="Action"
        >
          <option value="">All actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>
        <input
          style={{ ...inputStyle, maxWidth: 260 }}
          placeholder="Filter by user email"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          aria-label="User email"
        />
        <button type="button" style={buttonSecondaryStyle} onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div style={{ ...cardStyle, color: colors.danger }}>{error}</div>
      ) : !loading && entries.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={28} />} title="No matching changes yet" />
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Who</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>What</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const changes = auditFieldChanges(entry)
                const open = expanded === entry.id
                return (
                  <Fragment key={entry.id}>
                    <tr
                      onClick={() => setExpanded(open ? null : entry.id)}
                      style={{ cursor: changes.length ? 'pointer' : 'default' }}
                    >
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {format(parseISO(entry.created_at), 'dd MMM yyyy, HH:mm')}
                      </td>
                      <td style={tdStyle}>{entry.actor_email || '—'}</td>
                      <td style={{ ...tdStyle, color: OPERATION_COLOR[entry.operation], fontWeight: 600 }}>
                        {OPERATION_LABEL[entry.operation]}
                      </td>
                      <td style={tdStyle}>
                        {auditSummary(entry)}
                        {changes.length > 0 && (
                          <span style={{ color: colors.muted, marginLeft: 6 }}>{open ? '▾' : '▸'}</span>
                        )}
                      </td>
                    </tr>
                    {open && changes.length > 0 && (
                      <tr>
                        <td style={tdStyle} />
                        <td style={tdStyle} colSpan={3}>
                          <table style={{ ...tableStyle, fontSize: 12 }}>
                            <tbody>
                              {changes.map((c) => (
                                <tr key={c.field}>
                                  <td style={{ ...tdStyle, color: colors.muted, width: 160 }}>{c.field}</td>
                                  <td style={{ ...tdStyle, textDecoration: 'line-through', color: colors.muted }}>
                                    {c.before}
                                  </td>
                                  <td style={tdStyle}>{c.after}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
