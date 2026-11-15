import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  decideApproval,
  listApprovals,
  requestApproval,
  type ApprovalRequest,
} from '../lib/featureSliceStores'
import { DEFAULT_APPROVAL_THRESHOLD_AED } from '../lib/makerChecker'
import { APPROVALS_CSV_COLUMNS } from '../lib/approvalsCsv'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M7: maker-checker approval queue with history and self-approve block. */
export default function ApprovalsPage() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<ApprovalRequest[]>([])
  const [filter, setFilter] = useState('pending')
  const [amount, setAmount] = useState(String(DEFAULT_APPROVAL_THRESHOLD_AED + 1000))
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listApprovals(filter))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load approvals'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, filter])

  useEffect(() => {
    void load()
  }, [load])

  async function onSample() {
    try {
      await requestApproval({
        objectType: 'expense',
        objectId: `sample-${Date.now()}`,
        action: 'pay',
        amountAed: Number(amount) || 0,
        requestedBy: appUserId,
      })
      showToast('Approval requested', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not request approval'), 'error')
    }
  }

  async function onDecide(id: string, status: 'approved' | 'rejected' | 'canceled') {
    try {
      await decideApproval(id, status, appUserId, note)
      setNote('')
      showToast(status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Canceled', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not decide'), 'error')
    }
  }

  async function importApprovalsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of APPROVALS_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, APPROVALS_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid approval rows', 'error')
        return
      }
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const amountAed = row.amount_aed ? Number(row.amount_aed) : null
        await requestApproval({
          objectType: row.object_type,
          objectId: row.object_id,
          action: row.action,
          amountAed: amountAed != null && Number.isFinite(amountAed) ? amountAed : null,
          requestedBy: appUserId,
        })
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} approval request(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Approvals CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Maker-checker</p>
          <h1 className={docsStyles.title}>Approvals</h1>
          <p className={docsStyles.subtitle}>
            Second pair of eyes for money actions (≥ AED {DEFAULT_APPROVAL_THRESHOLD_AED}). Payroll, large expenses,
            refunds, and supplier commitments wire here
            automatically. Maker cannot approve their own request.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importApprovalsCsv(f)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!rows.length}
            onClick={() => {
              exportListCsv(
                'approvals.csv',
                [
                  'status',
                  'object_type',
                  'object_id',
                  'action',
                  'amount_aed',
                  'summary',
                  'requested_by',
                  'decided_by',
                  'decision_note',
                  'created_at',
                  'decided_at',
                ],
                rows.map((r) => ({
                  status: r.status,
                  object_type: r.object_type,
                  object_id: r.object_id,
                  action: r.action,
                  amount_aed: r.amount_aed ?? '',
                  summary: r.summary,
                  requested_by: r.requested_by || '',
                  decided_by: r.decided_by || '',
                  decision_note: r.decision_note,
                  created_at: r.created_at,
                  decided_at: r.decided_at || '',
                })),
              )
              showToast('Approvals CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={labelStyle}>
          Filter
          <select style={selectStyle} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="canceled">Canceled</option>
            <option value="all">All</option>
          </select>
        </label>
        <label style={labelStyle}>
          Sample amount (AED)
          <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button type="button" style={buttonPrimaryStyle} onClick={() => void onSample()}>
          Request sample approval
        </button>
      </div>

      <label style={{ ...labelStyle, marginBottom: 12, maxWidth: 520 }}>
        Decision note (optional)
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why approve / reject" />
      </label>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={22} />} title="Queue clear" subtitle="No matching approval requests." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => {
            const isMaker = Boolean(appUserId && r.requested_by && r.requested_by === appUserId)
            return (
              <article key={r.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>{r.summary || `${r.action} ${r.object_type}`}</strong>
                  <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                    {r.status} · {r.object_type}/{r.object_id.slice(0, 8)}
                    {r.amount_aed != null ? ` · AED ${Number(r.amount_aed).toFixed(2)}` : ''}
                  </div>
                  {r.decision_note ? (
                    <div style={{ color: colors.muted2, fontSize: 12, marginTop: 4 }}>Note: {r.decision_note}</div>
                  ) : null}
                  {isMaker && r.status === 'pending' ? (
                    <div style={{ color: colors.warn, fontSize: 12, marginTop: 4 }}>You requested this — another user must decide.</div>
                  ) : null}
                </div>
                {r.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={buttonPrimaryStyle}
                      disabled={isMaker}
                      onClick={() => void onDecide(r.id, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      disabled={isMaker}
                      onClick={() => void onDecide(r.id, 'rejected')}
                    >
                      Reject
                    </button>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => void onDecide(r.id, 'canceled')}>
                      Cancel
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
