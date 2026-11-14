import { useCallback, useEffect, useState } from 'react'
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
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M7 first slice: maker-checker approval queue. */
export default function ApprovalsPage() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<ApprovalRequest[]>([])
  const [amount, setAmount] = useState('6000')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listApprovals('pending'))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load approvals'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

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

  async function onDecide(id: string, status: 'approved' | 'rejected') {
    try {
      await decideApproval(id, status, appUserId)
      showToast(status === 'approved' ? 'Approved' : 'Rejected', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not decide'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Maker-checker · first slice</p>
          <h1 className={docsStyles.title}>Approvals</h1>
          <p className={docsStyles.subtitle}>Second pair of eyes for money actions. Wire into pay flows next.</p>
        </div>
      </header>

      <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={labelStyle}>
          Sample amount (AED)
          <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button type="button" style={buttonPrimaryStyle} onClick={() => void onSample()}>
          Request sample approval
        </button>
      </div>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={22} />} title="Queue clear" subtitle="No pending approvals." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <article key={r.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>{r.summary || `${r.action} ${r.object_type}`}</strong>
                <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>{r.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={buttonPrimaryStyle} onClick={() => void onDecide(r.id, 'approved')}>
                  Approve
                </button>
                <button type="button" style={buttonSecondaryStyle} onClick={() => void onDecide(r.id, 'rejected')}>
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
