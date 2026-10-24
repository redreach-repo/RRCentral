import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import { Download, ShieldCheck } from 'lucide-react'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { can } from '../lib/permissions'
import EmptyState from '../components/EmptyState'
import {
  AUDIT_FOCUS,
  AUDIT_TABLE_LABELS,
  auditCsvRows,
  auditFieldChanges,
  auditFieldLabel,
  auditFocusOf,
  auditSummary,
  isAuditAvailable,
  loadAuditLog,
  type AuditEntry,
  type AuditFocus,
} from '../lib/auditLog'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  downloadCsv,
  escapeCsv,
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

const SINCE_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: 'all', label: 'All time', days: null },
]

const FOCUS_COLOR: Record<AuditFocus, string> = {
  contracts: '#60a5fa',
  prices: '#f59e0b',
  commission: '#c084fc',
}

type Named = { id: string; name?: string; account_id?: string }

// Contracts and commission rows carry only ids: look up the client each belongs to.
async function lookupClients(
  rows: AuditEntry[],
  accountId: string,
): Promise<{ deals: Record<string, string>; names: Record<string, string> }> {
  const dealIds = new Set<string>()
  for (const r of rows) {
    const data = r.new_data || r.old_data || {}
    if (r.table_name === 'ctrm_deal_commissions' && typeof data.deal_id === 'string') dealIds.add(data.deal_id)
  }
  const deals: Record<string, string> = {}
  if (dealIds.size) {
    const { data } = await db.from('ctrm_deals').select('id, account_id').in('id', [...dealIds])
    for (const d of (data || []) as Named[]) if (d.account_id) deals[d.id] = d.account_id
  }
  const ids = new Set<string>(Object.values(deals))
  for (const r of rows) {
    if (r.account_id) ids.add(r.account_id)
    if (r.table_name === 'accounts' && r.row_id) ids.add(r.row_id)
  }
  if (accountId) ids.add(accountId)
  const names: Record<string, string> = {}
  if (ids.size) {
    const { data } = await db.from('accounts').select('id, name').in('id', [...ids])
    for (const a of (data || []) as Named[]) names[a.id] = a.name || ''
  }
  return { deals, names }
}

export default function AuditLogPage() {
  const { userRole } = useAuth()
  const [params, setParams] = useSearchParams()
  const focus = (params.get('focus') || '') as AuditFocus | ''
  const accountId = params.get('account') || ''
  const [since, setSince] = useState('30')
  const [accountNames, setAccountNames] = useState<Record<string, string>>({})
  const [dealAccounts, setDealAccounts] = useState<Record<string, string>>({})
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
      const days = SINCE_OPTIONS.find((o) => o.value === since)?.days ?? null
      let accountDealIds: string[] = []
      if (accountId) {
        const { data } = await db.from('ctrm_deals').select('id').eq('account_id', accountId)
        accountDealIds = ((data || []) as Named[]).map((d) => d.id)
      }
      const rows = await loadAuditLog({
        table,
        operation,
        actor: actor.trim(),
        focus,
        accountId,
        accountDealIds,
        since: days ? subDays(new Date(), days).toISOString() : undefined,
        limit: 500,
      })
      setEntries(rows)
      const named = await lookupClients(rows, accountId)
      setDealAccounts(named.deals)
      setAccountNames(named.names)
    } catch (e) {
      setError(
        isMissingRelationError(e)
          ? 'The audit trail is not set up yet. Apply supabase/migrations/20260926080000_audit_log.sql in Supabase.'
          : errorMessage(e, 'Could not load the audit log'),
      )
    } finally {
      setLoading(false)
    }
  }, [table, operation, actor, focus, accountId, since])

  const clientOf = useCallback(
    (entry: AuditEntry): string => {
      const data = entry.new_data || entry.old_data || {}
      const id =
        entry.account_id ||
        (entry.table_name === 'ctrm_deal_commissions' && typeof data.deal_id === 'string' ? dealAccounts[data.deal_id] : '')
      return id && entry.table_name !== 'accounts' ? accountNames[id] || '' : ''
    },
    [accountNames, dealAccounts],
  )

  const csv = useMemo(() => auditCsvRows(entries), [entries])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(t)
  }, [load])

  if (!can(userRole, 'audit.read')) {
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
        Every create, change and delete on key records, who did it and what changed. Recorded by the database,
        so it cannot be edited from the app. Secrets are hidden.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['', 'contracts', 'prices', 'commission'] as const).map((f) => (
          <button
            key={f || 'all'}
            type="button"
            onClick={() => {
              setTable('')
              setParam('focus', f)
            }}
            style={{
              ...buttonSecondaryStyle,
              padding: '6px 12px',
              fontSize: 13,
              borderColor: focus === f ? colors.accent : undefined,
              background: focus === f ? 'rgba(232,93,4,0.15)' : undefined,
            }}
          >
            {f ? AUDIT_FOCUS[f].label : 'Everything'}
          </button>
        ))}
      </div>

      {accountId ? (
        <div style={{ ...cardStyle, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            History for <strong>{accountNames[accountId] || 'this client'}</strong>
          </span>
          <Link to={`/accounts/${accountId}`} style={{ color: colors.text, fontSize: 13 }}>
            Open client
          </Link>
          <button type="button" style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => setParam('account', '')}>
            Show all clients
          </button>
        </div>
      ) : null}

      <div style={toolbarStyle}>
        <select style={selectStyle} value={since} onChange={(e) => setSince(e.target.value)} aria-label="Period">
          {SINCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={table} onChange={(e) => setTable(e.target.value)} aria-label="Record type">
          <option value="">All records</option>
          {Object.entries(AUDIT_TABLE_LABELS)
            .filter(([key]) => !focus || AUDIT_FOCUS[focus].tables.includes(key))
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([key, label]) => (
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
          {loading ? 'Loading' : 'Refresh'}
        </button>
        <button
          type="button"
          style={buttonSecondaryStyle}
          disabled={!entries.length}
          onClick={() =>
            downloadCsv(
              `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`,
              csv.map((row) => row.map(escapeCsv).join(',')).join('\n'),
            )
          }
        >
          <Download size={14} /> Download CSV
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
                        {(() => {
                          const f = auditFocusOf(entry)
                          return f ? (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '1px 6px',
                                borderRadius: 999,
                                marginRight: 6,
                                border: `1px solid ${FOCUS_COLOR[f]}`,
                                color: FOCUS_COLOR[f],
                              }}
                            >
                              {AUDIT_FOCUS[f].label}
                            </span>
                          ) : null
                        })()}
                        {auditSummary(entry)}
                        {clientOf(entry) ? <span style={{ color: colors.muted }}> for {clientOf(entry)}</span> : null}
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
                                  <td style={{ ...tdStyle, color: colors.muted, width: 160 }}>{auditFieldLabel(c.field)}</td>
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
