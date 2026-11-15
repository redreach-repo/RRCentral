import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import Modal from '../Modal'
import { useToast } from '../../contexts/ToastContext'
import { describeProposal, type AiProposal } from '../../lib/aiApprovals/aiApprovals'
import {
  listAiProposalsForAccount,
  requestAiProposals,
} from '../../lib/aiApprovals/aiApprovalsStore'
import { errorMessage } from '../../lib/errors'
import { exportListCsv } from '../../lib/listIo'
import { isSupabaseConfigured } from '../../lib/supabaseConfig'
import type { Account } from '../../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
} from '../../lib/uiStyles'

const DEFAULT_INSTRUCTION =
  'Suggest useful next steps for this account: timeline notes to log, or safe field updates (industry, country, city, website, notes).'

/**
 * Account detail → Suggest with AI.
 * Creates pending rows in ai_action_proposals via hm-ai-propose; nothing
 * writes until a person approves on /ai-approvals.
 */
export default function AiSuggestButton({
  account,
  editable,
}: {
  account: Account
  editable: boolean
}) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<AiProposal[]>([])
  const [missing, setMissing] = useState(false)
  const [setupHint, setSetupHint] = useState('')

  async function refreshPending() {
    if (!isSupabaseConfigured()) {
      setMissing(true)
      setSetupHint('Supabase is not configured in this environment.')
      return
    }
    const r = await listAiProposalsForAccount(account.id, 'pending')
    setPending(r.rows)
    setMissing(r.missing)
    setSetupHint(r.missing ? 'AI approval queue is not set up yet (see docs/modules/ai-approval-queue.md).' : '')
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setMissing(true)
          setSetupHint('Supabase is not configured in this environment.')
        }
        return
      }
      const r = await listAiProposalsForAccount(account.id, 'pending')
      if (cancelled) return
      setPending(r.rows)
      setMissing(r.missing)
      setSetupHint(r.missing ? 'AI approval queue is not set up yet (see docs/modules/ai-approval-queue.md).' : '')
    })()
    return () => {
      cancelled = true
    }
  }, [open, account.id])

  if (!editable) return null

  async function ask() {
    const text = instruction.trim()
    if (!text) {
      showToast('Add a short instruction first', 'error')
      return
    }
    setBusy(true)
    try {
      const r = await requestAiProposals(account.id, text)
      if (r.error) {
        showToast(r.error, 'error')
        await refreshPending()
        return
      }
      if (!r.count) {
        showToast('AI had nothing to suggest', 'error')
      } else {
        showToast(`${r.count} suggestion${r.count === 1 ? '' : 's'} added to the AI approval queue`, 'success')
      }
      await refreshPending()
    } catch (e) {
      showToast(errorMessage(e, 'Could not ask AI'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(true)}>
        <Sparkles size={14} /> Suggest with AI
      </button>
      <Modal open={open} title={`Suggest with AI · ${account.name}`} onClose={() => setOpen(false)} width={560}>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>
          AI only proposes. Nothing changes on this account until someone approves a suggestion on the{' '}
          <Link to="/ai-approvals" style={{ color: colors.accent }}>
            AI approvals
          </Link>{' '}
          queue.
        </p>

        {missing ? (
          <p role="status" style={{ color: colors.warn, fontSize: 13, marginBottom: 12 }}>
            {setupHint}
          </p>
        ) : (
          <>
            <label style={fieldStyle}>
              <span style={labelStyle}>What should change?</span>
              <textarea
                style={{ ...inputStyle, minHeight: 88 }}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={busy}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void ask()}>
                {busy ? 'Asking AI…' : 'Get suggestions'}
              </button>
              <Link to="/ai-approvals" style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}>
                Open queue
              </Link>
            </div>
          </>
        )}

        {pending.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 12, color: colors.muted, fontWeight: 600 }}>
                Waiting on this account ({pending.length})
              </p>
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  exportListCsv(
                    `ai-suggestions-${account.reference || account.id}.csv`,
                    ['summary', 'action', 'detail', 'rationale', 'model', 'cost_usd', 'proposed_by', 'created_at', 'status'],
                    pending.map((p) => ({
                      summary: p.summary || describeProposal(p.action, p.payload)[0] || '',
                      action: p.action,
                      detail: describeProposal(p.action, p.payload).join(' | '),
                      rationale: p.rationale || '',
                      model: p.model || '',
                      cost_usd: p.cost_usd,
                      proposed_by: p.proposed_by_email || '',
                      created_at: p.created_at || '',
                      status: p.status,
                    })),
                  )
                  showToast('AI suggestions CSV downloaded', 'success')
                }}
              >
                Export CSV
              </button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {pending.map((p) => (
                <li
                  key={p.id}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                  }}
                >
                  <strong>{p.summary || describeProposal(p.action, p.payload)[0]}</strong>
                  <div style={{ color: colors.muted, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                    {describeProposal(p.action, p.payload).join('\n')}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
