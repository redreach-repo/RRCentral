import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { useI18n } from '../../../contexts/I18nContext'
import { useToast } from '../../../contexts/ToastContext'
import { currentAuthMode } from '../../../lib/db'
import { errorMessage } from '../../../lib/errors'
import {
  canCancel,
  canDecide,
  decisionProblem,
  sortForQueue,
  type ApprovalPolicy,
  type ApprovalRequest,
} from '../../../lib/makerChecker/makerChecker'
import {
  cancelApprovalRequest,
  decideApprovalRequest,
  listApprovalPolicies,
  listApprovalRequests,
} from '../../../lib/makerChecker/store'
import { btn, btnGhost, btnPrimary, input } from '../../../lib/pageStyles'
import { colors, pageStyle } from '../../../lib/uiStyles'
import SetupNotice from '../_shared/SetupNotice'

const card: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 14,
  background: colors.card,
  display: 'grid',
  gap: 8,
}

const money = (n: number | null, cur: string) =>
  n == null ? '' : `${cur} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ApprovalsPage() {
  const { t } = useI18n()
  const { user, userRole } = useAuth()
  const { showToast } = useToast()
  const email = user?.email || ''
  const localMode = currentAuthMode() === 'local'
  const [rows, setRows] = useState<ApprovalRequest[]>([])
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([])
  const [missing, setMissing] = useState(false)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (localMode) return
    try {
      const [r, p] = await Promise.all([listApprovalRequests(), listApprovalPolicies()])
      setMissing(r.missingTable || p.missingTable)
      setRows(r.rows)
      setPolicies(p.rows)
    } catch (err) {
      showToast(errorMessage(err), 'error')
    }
  }, [localMode, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(
    () => sortForQueue(filter === 'pending' ? rows.filter((r) => r.status === 'pending') : rows),
    [rows, filter],
  )

  async function decide(r: ApprovalRequest, approve: boolean) {
    const reason = reasons[r.id] || ''
    const problem = decisionProblem(approve, reason)
    if (problem) return showToast(problem, 'error')
    setBusy(r.id)
    try {
      await decideApprovalRequest(r.id, approve, reason)
      await load()
    } catch (err) {
      showToast(errorMessage(err), 'error')
    } finally {
      setBusy('')
    }
  }

  async function withdraw(r: ApprovalRequest) {
    setBusy(r.id)
    try {
      await cancelApprovalRequest(r.id)
      await load()
    } catch (err) {
      showToast(errorMessage(err), 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div style={{ ...pageStyle, display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>{t('page.approvals.title')}</h1>
        <p style={{ color: colors.muted, margin: '4px 0 0' }}>{t('page.approvals.subtitle')}</p>
      </header>
      <SetupNotice localMode={localMode} missingTable={missing} doc="docs/modules/maker-checker.md" />
      <div style={{ display: 'flex', gap: 8 }}>
        {(['pending', 'all'] as const).map((f) => (
          <button key={f} type="button" style={filter === f ? btnPrimary : btnGhost} onClick={() => setFilter(f)}>
            {t(`page.approvals.filter.${f}`)}
          </button>
        ))}
      </div>
      {shown.length === 0 && !missing && !localMode && <p style={{ color: colors.muted }}>{t('page.approvals.empty')}</p>}
      {shown.map((r) => {
        const mine = canCancel(r, email) || r.maker_email.toLowerCase() === email.toLowerCase()
        return (
          <article key={r.id} style={card} aria-label={r.summary}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong>{r.summary}</strong>
              <span>{t(`page.approvals.status.${r.status}`)}</span>
            </div>
            <div style={{ color: colors.muted, fontSize: 13 }}>
              {r.action_key} · {money(r.amount, r.currency)} · {r.maker_email} · {new Date(r.created_at).toLocaleString()}
              {r.checker_email ? ` · ${r.checker_email}` : ''}
              {r.decision_reason ? ` · ${r.decision_reason}` : ''}
            </div>
            {canDecide(r, userRole, email) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  style={{ ...input, flex: '1 1 220px' }}
                  aria-label={t('page.approvals.reason')}
                  placeholder={t('page.approvals.reason')}
                  value={reasons[r.id] || ''}
                  onChange={(e) => setReasons((s) => ({ ...s, [r.id]: e.target.value }))}
                />
                <button type="button" style={btnPrimary} disabled={busy === r.id} onClick={() => void decide(r, true)}>
                  {t('page.approvals.approve')}
                </button>
                <button type="button" style={btn} disabled={busy === r.id} onClick={() => void decide(r, false)}>
                  {t('page.approvals.reject')}
                </button>
              </div>
            )}
            {r.status === 'pending' && mine && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: colors.muted }}>
                <span>{t('page.approvals.ownRequest')}</span>
                <button type="button" style={btnGhost} disabled={busy === r.id} onClick={() => void withdraw(r)}>
                  {t('page.approvals.cancel')}
                </button>
              </div>
            )}
          </article>
        )
      })}
      {policies.length > 0 && (
        <section style={card}>
          <strong>{t('page.approvals.policies')}</strong>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {policies.map((p) => (
              <li key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                {p.label || p.action_key} ({p.action_key}) ·{' '}
                {p.min_amount == null ? t('page.approvals.policy.always') : `${t('page.approvals.policy.minAmount')} ${p.min_amount}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
