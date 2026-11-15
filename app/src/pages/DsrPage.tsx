import { useCallback, useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { dsrTypeLabel } from '../lib/dsr/dsr'
import {
  createDsrRequest,
  listDsrRequests,
  runRetentionPrune,
  updateDsrStatus,
  type DsrRequestRow,
} from '../lib/m13Stores'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M13: data subject requests + retention prune. */
export default function DsrPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<DsrRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<'access' | 'erasure' | 'export'>('access')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listDsrRequests())
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
      await createDsrRequest({ requestType: type, subjectEmail: email, subjectName: name })
      setEmail('')
      setName('')
      showToast('DSR request recorded', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create request'), 'error')
    }
  }

  async function onPrune() {
    try {
      const r = await runRetentionPrune()
      showToast(`Pruned ${r.app_errors_deleted} errors, ${r.audit_deleted} audit rows`, 'success')
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
            Log access / erasure / export requests. Access can use Account → Export data; erasure anonymizes contacts via RPC.
          </p>
        </div>
        <button type="button" className={docsStyles.newBtn} onClick={() => void onPrune()}>
          Run retention prune
        </button>
      </header>

      <form onSubmit={(e) => void onAdd(e)} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 560 }}>
        <label style={labelStyle}>
          Type
          <select style={selectStyle} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="access">Access</option>
            <option value="erasure">Erasure</option>
            <option value="export">Export</option>
          </select>
        </label>
        <label style={labelStyle}>
          Subject email
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label style={labelStyle}>
          Subject name
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" style={buttonPrimaryStyle}>
          Log request
        </button>
      </form>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Shield size={22} />} title="No DSR requests" subtitle="Log a request when a subject asks for data access or erasure." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <article key={r.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>
                  {dsrTypeLabel(r.request_type)} · {r.subject_email || '—'}
                </strong>
                <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                  {r.status}
                  {r.subject_name ? ` · ${r.subject_name}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {r.status === 'received' ? (
                  <button type="button" style={buttonSecondaryStyle} onClick={() => void updateDsrStatus(r.id, 'start').then(load)}>
                    Start
                  </button>
                ) : null}
                {r.status !== 'completed' && r.status !== 'rejected' ? (
                  <>
                    <button type="button" style={buttonPrimaryStyle} onClick={() => void updateDsrStatus(r.id, 'complete').then(load)}>
                      Complete
                    </button>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => void updateDsrStatus(r.id, 'reject').then(load)}>
                      Reject
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
