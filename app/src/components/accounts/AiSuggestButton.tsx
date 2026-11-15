import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import Modal from '../Modal'
import { useToast } from '../../contexts/ToastContext'
import {
  describeProposal,
  type AiProposal,
  type AiProposalAction,
  type AiProposalStatus,
} from '../../lib/aiApprovals/aiApprovals'
import {
  listAiProposalsForAccount,
  requestAiProposals,
} from '../../lib/aiApprovals/aiApprovalsStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
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

const EXPORT_COLUMNS = [
  'summary',
  'action',
  'detail',
  'rationale',
  'model',
  'cost_usd',
  'proposed_by',
  'created_at',
  'status',
] as const

const STATUSES: AiProposalStatus[] = ['pending', 'executed', 'rejected', 'cancelled', 'failed']

function proposalMatchKey(summary: string, action: string, createdAt: string): string {
  return `${summary.trim().toLowerCase()}|${action.trim().toLowerCase()}|${createdAt.trim()}`
}

function parseAction(raw: string): AiProposalAction | null {
  const v = raw.trim()
  if (v === 'add_timeline_note' || v === 'update_account_fields') return v
  return null
}

function parseStatus(raw: string): AiProposalStatus {
  const v = raw.trim().toLowerCase()
  return (STATUSES as string[]).includes(v) ? (v as AiProposalStatus) : 'pending'
}

function parseCost(raw: string): number {
  const n = Number(String(raw || '').trim())
  return Number.isFinite(n) ? n : 0
}

function proposalDetailLines(p: AiProposal): string[] {
  if (p.id.startsWith('import-')) {
    return String(p.prompt || '')
      .split(' | ')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return describeProposal(p.action, p.payload)
}

function toExportRow(p: AiProposal) {
  const lines = proposalDetailLines(p)
  return {
    summary: p.summary || lines[0] || '',
    action: p.action,
    detail: lines.join(' | '),
    rationale: p.rationale || '',
    model: p.model || '',
    cost_usd: p.cost_usd,
    proposed_by: p.proposed_by_email || '',
    created_at: p.created_at || '',
    status: p.status,
  }
}

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
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [importedRows, setImportedRows] = useState<AiProposal[] | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

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
    setCsvFiltered(false)
    setImportedRows(null)
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
      setCsvFiltered(false)
      setImportedRows(null)
    })()
    return () => {
      cancelled = true
    }
  }, [open, account.id])

  if (!editable) return null

  const shown = csvFiltered && importedRows ? importedRows : pending

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

  async function importSuggestionsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byKey = new Map(
        pending.map((p) => [proposalMatchKey(p.summary || describeProposal(p.action, p.payload)[0] || '', p.action, p.created_at || ''), p] as const),
      )
      const next: AiProposal[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const summary = String(row.summary || '').trim()
        const action = parseAction(String(row.action || ''))
        const createdAt = String(row.created_at || '').trim()
        if (!summary || !action) {
          skipped += 1
          return
        }
        const key = proposalMatchKey(summary, action, createdAt)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existing = byKey.get(key)
        if (existing) {
          next.push(existing)
          matched += 1
          return
        }
        next.push({
          id: `import-${idx}`,
          account_id: account.id,
          action,
          payload: {},
          original_payload: null,
          summary,
          rationale: String(row.rationale || '').trim(),
          prompt: String(row.detail || '').trim(),
          model: String(row.model || '').trim(),
          cost_usd: parseCost(String(row.cost_usd ?? '')),
          status: parseStatus(String(row.status || '')),
          proposed_by_email: String(row.proposed_by || '').trim(),
          decided_by_email: '',
          decided_at: null,
          decision_note: '',
          error: '',
          created_at: createdAt,
        })
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching AI suggestions in CSV', 'error')
        return
      }
      setImportedRows(next)
      setCsvFiltered(true)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : '']
        .filter(Boolean)
        .join(', ')
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} AI suggestion(s) (${parts})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'AI suggestions CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
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

        {!missing ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 12, color: colors.muted, fontWeight: 600 }}>
                {csvFiltered ? `CSV filter (${shown.length})` : `Waiting on this account (${pending.length})`}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void importSuggestionsCsv(file)
                  }}
                />
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  disabled={importing}
                  onClick={() => importInputRef.current?.click()}
                >
                  {importing ? 'Importing…' : 'Import CSV'}
                </button>
                {csvFiltered ? (
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    onClick={() => {
                      setCsvFiltered(false)
                      setImportedRows(null)
                      showToast('Cleared CSV filter', 'success')
                    }}
                  >
                    Clear CSV filter
                  </button>
                ) : null}
                {shown.length > 0 ? (
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    onClick={() => {
                      exportListCsv(
                        `ai-suggestions-${account.reference || account.id}.csv`,
                        [...EXPORT_COLUMNS],
                        shown.map(toExportRow),
                      )
                      showToast('AI suggestions CSV downloaded', 'success')
                    }}
                  >
                    Export CSV
                  </button>
                ) : null}
              </div>
            </div>
            {shown.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {shown.map((p) => {
                  const lines = proposalDetailLines(p)
                  return (
                    <li
                      key={p.id}
                      style={{
                        border: `1px solid ${colors.border}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 13,
                      }}
                    >
                      <strong>{p.summary || lines[0]}</strong>
                      <div style={{ color: colors.muted, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                        {lines.join('\n')}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No pending suggestions yet.</p>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  )
}
