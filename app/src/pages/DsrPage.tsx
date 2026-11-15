import { useCallback, useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { dsrTypeLabel } from '../lib/dsr/dsr'
import { exportListCsv } from '../lib/listIo'
import {
  createDsrRequest,
  listDsrRequests,
  listRetentionRuns,
  runRetentionPrune,
  updateDsrStatus,
  type DsrRequestRow,
  type RetentionRunRow,
} from '../lib/m13Stores'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M13: data subject requests + retention prune. */
export default function DsrPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<DsrRequestRow[]>([])
  const [retentionRuns, setRetentionRuns] = useState<RetentionRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [type, setType] = useState<'access' | 'erasure' | 'export'>('access')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dsr, runs] = await Promise.all([
        listDsrRequests(),
        listRetentionRuns().catch(() => [] as RetentionRunRow[]),
      ])
      setRows(dsr)
      setRetentionRuns(runs)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load DSR requests'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createDsrRequest({
        requestType: type,
        subjectEmail: email,
        subjectName: name,
        detail,
      })
      setEmail('')
      setName('')
      setDetail('')
      showToast('DSR request recorded', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create request'), 'error')
    }
  }

  async function onPrune() {
    if (
      !window.confirm(
        'Run retention prune now? This permanently deletes aged app_errors and audit rows per policy.',
      )
    ) {
      return
    }
    try {
      const r = await runRetentionPrune()
      showToast(`Pruned ${r.app_errors_deleted} errors, ${r.audit_deleted} audit rows`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Retention prune failed'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Admin</p>
          <h1 className={docsStyles.title}>Data subject requests</h1>
          <p className={docsStyles.subtitle}>
            Log access / erasure / export requests. Access can use Account → Export data; erasure
            anonymizes contacts via RPC.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!rows.length}
            onClick={() => {
              exportListCsv(
                'dsr-requests.csv',
                ['request_type', 'subject_email', 'subject_name', 'status', 'detail', 'created_at', 'completed_at'],
                rows.map((r) => ({
                  request_type: r.request_type,
                  subject_email: r.subject_email,
                  subject_name: r.subject_name,
                  status: r.status,
                  detail: r.detail,
                  created_at: r.created_at,
                  completed_at: r.completed_at || '',
                })),
              )
              showToast('DSR CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!retentionRuns.length}
            onClick={() => {
              exportListCsv(
                'retention-runs.csv',
                ['id', 'created_at', 'ran_by', 'app_errors_deleted', 'audit_deleted', 'detail'],
                retentionRuns.map((r) => ({
                  id: r.id,
                  created_at: r.created_at,
                  ran_by: r.ran_by || '',
                  app_errors_deleted: r.app_errors_deleted,
                  audit_deleted: r.audit_deleted,
                  detail: r.detail || '',
                })),
              )
              showToast('Retention CSV downloaded', 'success')
            }}
          >
            Export retention CSV
          </button>
          <button type="button" className={docsStyles.newBtn} onClick={() => void onPrune()}>
            Run retention prune
          </button>
        </div>
      </header>

      <form
        onSubmit={(e) => void onAdd(e)}
        style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 560 }}
      >
        <label style={labelStyle}>
          Type
          <select
            style={selectStyle}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="access">Access</option>
            <option value="erasure">Erasure</option>
            <option value="export">Export</option>
          </select>
        </label>
        <label style={labelStyle}>
          Subject email
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label style={labelStyle}>
          Subject name
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Notes
          <input
            style={inputStyle}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Ticket / channel / context"
          />
        </label>
        <button type="submit" style={buttonPrimaryStyle}>
          Log request
        </button>
      </form>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Shield size={22} />}
          title="No DSR requests"
          subtitle="Log a request when a subject asks for data access or erasure."
        />
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
          {rows.map((r) => (
            <article
              key={r.id}
              style={{
                ...cardStyle,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong>
                  {dsrTypeLabel(r.request_type)} · {r.subject_email || '—'}
                </strong>
                <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                  {r.status}
                  {r.subject_name ? ` · ${r.subject_name}` : ''}
                  {r.detail ? ` · ${r.detail}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {r.status === 'received' ? (
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    onClick={() => void updateDsrStatus(r.id, 'start').then(load)}
                  >
                    Start
                  </button>
                ) : null}
                {r.status !== 'completed' && r.status !== 'rejected' ? (
                  <>
                    <button
                      type="button"
                      style={buttonPrimaryStyle}
                      onClick={() => void updateDsrStatus(r.id, 'complete').then(load)}
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      onClick={() => void updateDsrStatus(r.id, 'reject').then(load)}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Retention runs</h2>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.muted }}>
          Last prune jobs logged by <code>rr_retention_run</code>. Deletes are permanent.
        </p>
        {retentionRuns.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No retention runs yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {retentionRuns.map((run) => (
              <li key={run.id} style={{ fontSize: 13 }}>
                <strong>{run.created_at.slice(0, 19).replace('T', ' ')}</strong>
                {run.ran_by ? ` · ${run.ran_by}` : ''} · errors {run.app_errors_deleted} · audit{' '}
                {run.audit_deleted}
                {run.detail ? ` · ${run.detail}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
