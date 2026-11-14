import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '../../../contexts/I18nContext'
import { isSupabaseConfigured } from '../../../lib/supabaseConfig'
import {
  ACCOUNT_FIELDS,
  NOTE_KINDS,
  cleanEditedPayload,
  describeProposal,
  payloadProblem,
  statusTone,
  type AiDecision,
  type AiProposal,
  type AiProposalStatus,
} from '../../../lib/aiApprovals/aiApprovals'
import {
  decideAiProposal,
  listAiProposals,
  requestAiProposals,
  searchAccounts,
} from '../../../lib/aiApprovals/aiApprovalsStore'
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
} from '../../../lib/uiStyles'
import SetupNotice from '../_shared/SetupNotice'

const DOC = 'docs/modules/ai-approval-queue.md'
const FILTERS: (AiProposalStatus | 'all')[] = ['pending', 'executed', 'rejected', 'failed', 'cancelled', 'all']

const toneColor = { good: colors.success, bad: colors.danger, neutral: colors.muted } as const
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }

export default function AiApprovalsPage() {
  const { t } = useI18n()
  const localMode = !isSupabaseConfigured()
  const [filter, setFilter] = useState<AiProposalStatus | 'all'>('pending')
  const [rows, setRows] = useState<AiProposal[]>([])
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string>('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    if (localMode) return
    const r = await listAiProposals(filter)
    setRows(r.rows)
    setMissing(r.missing)
    setLoadError(r.missing ? '' : r.error)
  }, [filter, localMode])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(p: AiProposal, decision: AiDecision, payload: Record<string, string> | null) {
    setBusyId(p.id)
    setRowError((e) => ({ ...e, [p.id]: '' }))
    const r = await decideAiProposal(p.id, decision, payload, note)
    setBusyId('')
    if (r.error) {
      setRowError((e) => ({ ...e, [p.id]: r.error }))
      return
    }
    setEditing('')
    setNote('')
    void load()
  }

  function startEdit(p: AiProposal) {
    setEditing(p.id)
    setNote('')
    setDraft(
      p.action === 'add_timeline_note'
        ? { kind: p.payload.kind || 'note', body: p.payload.body || '' }
        : Object.fromEntries(ACCOUNT_FIELDS.map((f) => [f, p.payload[f] ?? ''])),
    )
  }

  if (localMode || missing) {
    return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>{t('aiq.title')}</h1>
        <SetupNotice localMode={localMode} missingTable={missing} doc={DOC} />
      </div>
    )
  }

  return (
    <div style={{ ...pageStyle, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={pageTitleStyle}>{t('aiq.title')}</h1>
        <p style={pageSubtitleStyle}>{t('aiq.subtitle')}</p>
      </div>

      <AskPanel onDone={() => void load()} />

      <section style={cardStyle} aria-labelledby="aiq-queue">
        <div style={{ ...row, justifyContent: 'space-between' }}>
          <h2 id="aiq-queue" style={sectionTitleStyle}>{t('aiq.status.' + filter)}</h2>
          <label style={row}>
            <span style={labelStyle}>{t('aiq.filter')}</span>
            <select style={inputStyle} value={filter} onChange={(e) => setFilter(e.target.value as AiProposalStatus | 'all')}>
              {FILTERS.map((f) => (
                <option key={f} value={f}>{t('aiq.status.' + f)}</option>
              ))}
            </select>
          </label>
        </div>
        {loadError && <p role="alert" style={{ color: colors.danger }}>{loadError}</p>}
        {!rows.length && !loadError && <p style={{ color: colors.muted }}>{t('aiq.empty')}</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {rows.map((p) => {
            const lines = describeProposal(p.action, p.payload)
            const isEditing = editing === p.id
            const cleaned = isEditing ? cleanEditedPayload(p.action, draft) : null
            const problem = cleaned ? payloadProblem(p.action, cleaned) : ''
            return (
              <li key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 6 }}>
                <div style={{ ...row, justifyContent: 'space-between' }}>
                  <strong>{p.accounts?.name || p.account_id}: {p.summary || lines[0]}</strong>
                  <span style={{ color: toneColor[statusTone(p.status)], fontSize: 13 }}>{t('aiq.status.' + p.status)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</div>
                {p.original_payload && (
                  <div style={{ color: colors.muted, fontSize: 13 }}>
                    {t('aiq.edited')} {describeProposal(p.action, p.original_payload).join(' ')}
                  </div>
                )}
                {p.rationale && <div style={{ color: colors.muted, fontSize: 13 }}>{t('aiq.why')}: {p.rationale}</div>}
                <div style={{ color: colors.muted, fontSize: 12 }}>
                  {t('aiq.asked')}: “{p.prompt}” {t('aiq.by')} {p.proposed_by_email || '?'} · {new Date(p.created_at).toLocaleString()}
                  {p.decided_by_email ? ` · ${t('aiq.status.' + p.status)} ${t('aiq.by')} ${p.decided_by_email}` : ''}
                  {p.decision_note ? ` · ${p.decision_note}` : ''}
                </div>
                {p.error && <div role="alert" style={{ color: colors.danger, fontSize: 13 }}>{p.error}</div>}

                {p.status === 'pending' && !isEditing && (
                  <div style={row}>
                    <button type="button" style={buttonPrimaryStyle} disabled={busyId === p.id} onClick={() => void decide(p, 'approve', null)}>
                      {t('aiq.approve')}
                    </button>
                    <button type="button" style={buttonSecondaryStyle} disabled={busyId === p.id} onClick={() => startEdit(p)}>
                      {t('aiq.edit')}
                    </button>
                    <button type="button" style={buttonDangerStyle} disabled={busyId === p.id} onClick={() => void decide(p, 'reject', null)}>
                      {t('aiq.reject')}
                    </button>
                    <button type="button" style={buttonSecondaryStyle} disabled={busyId === p.id} onClick={() => void decide(p, 'cancel', null)}>
                      {t('aiq.cancel')}
                    </button>
                  </div>
                )}

                {isEditing && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {p.action === 'add_timeline_note' ? (
                      <>
                        <label style={fieldStyle}>
                          <span style={labelStyle}>kind</span>
                          <select style={inputStyle} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                            {NOTE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                          </select>
                        </label>
                        <label style={fieldStyle}>
                          <span style={labelStyle}>body</span>
                          <textarea style={{ ...inputStyle, minHeight: 90 }} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                        </label>
                      </>
                    ) : (
                      ACCOUNT_FIELDS.map((f) => (
                        <label key={f} style={fieldStyle}>
                          <span style={labelStyle}>{f}</span>
                          <input style={inputStyle} value={draft[f] ?? ''} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
                        </label>
                      ))
                    )}
                    <label style={fieldStyle}>
                      <span style={labelStyle}>{t('aiq.note')}</span>
                      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    {problem && <div role="alert" style={{ color: colors.danger, fontSize: 13 }}>{problem}</div>}
                    <div style={row}>
                      <button type="button" style={buttonPrimaryStyle} disabled={!!problem || busyId === p.id} onClick={() => cleaned && void decide(p, 'approve', cleaned)}>
                        {t('aiq.save')}
                      </button>
                      <button type="button" style={buttonSecondaryStyle} onClick={() => setEditing('')}>{t('aiq.close')}</button>
                    </div>
                  </div>
                )}
                {rowError[p.id] && <div role="alert" style={{ color: colors.danger, fontSize: 13 }}>{rowError[p.id]}</div>}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function AskPanel({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [term, setTerm] = useState('')
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([])
  const [account, setAccount] = useState<{ id: string; name: string } | null>(null)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)

  useEffect(() => {
    if (account) return
    let live = true
    const h = setTimeout(() => {
      void searchAccounts(term).then((m) => live && setMatches(m))
    }, 250)
    return () => {
      live = false
      clearTimeout(h)
    }
  }, [term, account])

  async function submit() {
    if (!account || !instruction.trim()) return
    setBusy(true)
    setMsg(null)
    const r = await requestAiProposals(account.id, instruction)
    setBusy(false)
    if (r.error) return setMsg({ text: r.error, bad: true })
    setMsg({ text: r.count ? `${r.count} ${t('aiq.ask.done')}` : t('aiq.ask.none'), bad: false })
    if (r.count) {
      setInstruction('')
      onDone()
    }
  }

  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 10 }} aria-labelledby="aiq-ask">
      <h2 id="aiq-ask" style={sectionTitleStyle}>{t('aiq.ask.title')}</h2>
      <label style={fieldStyle}>
        <span style={labelStyle}>{t('aiq.ask.account')}</span>
        {account ? (
          <span style={row}>
            <strong>{account.name}</strong>
            <button type="button" style={buttonSecondaryStyle} onClick={() => { setAccount(null); setTerm('') }}>×</button>
          </span>
        ) : (
          <input style={inputStyle} value={term} placeholder={t('aiq.ask.search')} onChange={(e) => setTerm(e.target.value)} />
        )}
      </label>
      {!account && matches.length > 0 && (
        <div style={row}>
          {matches.map((m) => (
            <button key={m.id} type="button" style={buttonSecondaryStyle} onClick={() => { setAccount(m); setMatches([]) }}>{m.name}</button>
          ))}
        </div>
      )}
      <label style={fieldStyle}>
        <span style={labelStyle}>{t('aiq.ask.instruction')}</span>
        <textarea
          style={{ ...inputStyle, minHeight: 80 }}
          value={instruction}
          maxLength={2000}
          placeholder={t('aiq.ask.placeholder')}
          onChange={(e) => setInstruction(e.target.value)}
        />
      </label>
      <div style={row}>
        <button type="button" style={buttonPrimaryStyle} disabled={busy || !account || !instruction.trim()} onClick={() => void submit()}>
          {busy ? t('aiq.ask.working') : t('aiq.ask.submit')}
        </button>
        {msg && <span role={msg.bad ? 'alert' : 'status'} style={{ color: msg.bad ? colors.danger : colors.muted }}>{msg.text}</span>}
      </div>
    </section>
  )
}
