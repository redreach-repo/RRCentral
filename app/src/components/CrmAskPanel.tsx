import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import type { AskQuoteDraft } from '../lib/aiAssist'
import { AI_LOCAL_MODE, runCrmAsk } from '../lib/aiAssistStore'
import { createAskDraftQuote } from '../lib/askDraftQuote'
import { buildCrmAskFacts, CRM_ASK_SUGGESTIONS } from '../lib/crmAsk'
import { resolveSalesOwnerName } from '../lib/crmWorkQueue'
import { DIVISIONS, VAT_RATE } from '../lib/config'
import { errorMessage } from '../lib/errors'
import { formatAED } from '../lib/money'
import { isSupabaseConfigured } from '../lib/supabaseConfig'
import type { AppUser, CrmEntry } from '../lib/types'
import { btn, btnGhost, btnPrimary, colors, input } from '../lib/pageStyles'

type ChatTurn = {
  role: 'user' | 'assistant'
  text: string
  costUsd?: number
  quoteDraft?: AskQuoteDraft | null
}

const fab: CSSProperties = {
  ...btnPrimary,
  position: 'fixed',
  right: 20,
  bottom: 20,
  zIndex: 40,
  borderRadius: 999,
  padding: '12px 16px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
}

const panel: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 45,
  width: 'min(420px, calc(100vw - 24px))',
  maxHeight: 'min(560px, calc(100vh - 32px))',
  display: 'flex',
  flexDirection: 'column',
  background: '#1a1d22',
  border: `1px solid ${colors.border}`,
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
  color: colors.text,
}

type Props = {
  entries: CrmEntry[]
  owners: AppUser[]
}

function divisionLabel(code: string): string {
  return DIVISIONS.find((d) => d.code === code)?.brand || code
}

/**
 * Ask RR chat: answers from loaded CRM, and can propose a Draft quotation
 * that is only saved after the salesperson confirms.
 */
export default function CrmAskPanel({ entries, owners }: Props) {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [creatingKey, setCreatingKey] = useState<number | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [error, setError] = useState('')
  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const myOwnerName = useMemo(
    () => resolveSalesOwnerName(user?.email, owners.map((o) => ({ email: o.email, name: o.name }))),
    [user?.email, owners],
  )

  const facts = useMemo(
    () => buildCrmAskFacts(entries, { myOwnerName }),
    [entries, myOwnerName],
  )

  useEffect(() => {
    if (!open) return
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [open, turns, busy, creatingKey])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    if (!facts.length) {
      setError('Load some CRM companies first, then ask again.')
      return
    }
    setError('')
    setCreatedQuoteId(null)
    setDraft('')
    setTurns((t) => [...t, { role: 'user', text: q }])
    setBusy(true)
    try {
      if (!isSupabaseConfigured()) throw new Error(AI_LOCAL_MODE)
      const historyFacts = turns
        .slice(-4)
        .map((t) => `${t.role === 'user' ? 'Earlier question' : 'Earlier answer'}: ${t.text}`)
      const r = await runCrmAsk({
        feature: 'crm_ask',
        askerName: myOwnerName || user?.email || 'team',
        question: q,
        facts: [...facts, ...historyFacts],
      })
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          text: r.text,
          costUsd: r.costUsd,
          quoteDraft: r.quoteDraft,
        },
      ])
    } catch (e) {
      setError(errorMessage(e, 'Ask RR is not available right now.'))
      setTurns((t) => t.slice(0, -1))
      setDraft(q)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDraft(turnIndex: number, proposal: AskQuoteDraft) {
    if (creatingKey != null) return
    setCreatingKey(turnIndex)
    setError('')
    try {
      const result = await createAskDraftQuote({
        proposal,
        entries,
        who: user?.email || myOwnerName || 'ask-rr',
        defaults: {
          paymentTerms: settings.paymentTerms || '',
          deliveryTerms: settings.deliveryTerms || '',
          moq: settings.moqDefault || '',
          vatRate: Number(settings.vatRate || VAT_RATE) || VAT_RATE,
        },
      })
      setCreatedQuoteId(result.quoteId)
      showToast(`Draft quotation saved for ${result.client}`, 'success')
      setTurns((t) =>
        t.map((turn, i) =>
          i === turnIndex
            ? {
                ...turn,
                quoteDraft: null,
                text: `${turn.text}\n\nSaved as Draft for ${result.client} (${formatAED(result.amount)}).`,
              }
            : turn,
        ),
      )
    } catch (e) {
      setError(errorMessage(e, 'Could not save the draft quotation.'))
    } finally {
      setCreatingKey(null)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void ask(draft)
  }

  if (!open) {
    return (
      <button type="button" style={fab} onClick={() => setOpen(true)} title="Ask RR about your pipeline">
        <Sparkles size={16} /> Ask RR
      </button>
    )
  }

  return (
    <div style={panel} role="dialog" aria-label="Ask RR">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.card,
        }}
      >
        <MessageCircle size={18} color={colors.accent} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Ask RR</div>
          <div style={{ fontSize: 11, color: colors.muted2 }}>
            Answers + draft quotes (confirm to save)
          </div>
        </div>
        <button type="button" style={{ ...btnGhost, padding: 6 }} onClick={() => setOpen(false)} aria-label="Close Ask RR">
          <X size={16} />
        </button>
      </div>

      <div
        ref={scroller}
        style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {turns.length === 0 ? (
          <div style={{ color: colors.muted, fontSize: 13, lineHeight: 1.45 }}>
            Ask about overdue follow-ups, or say “Draft a quotation for Mass Allied: 50 polos at 48 AED”. Quotes are
            only saved when you confirm.
          </div>
        ) : null}
        {turns.map((t, i) => (
          <div key={`${t.role}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
                padding: '8px 11px',
                borderRadius: 12,
                background: t.role === 'user' ? colors.accent : colors.card,
                color: colors.text,
                fontSize: 13,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                border: t.role === 'assistant' ? `1px solid ${colors.border}` : 0,
              }}
            >
              {t.text}
              {t.role === 'assistant' && t.costUsd ? (
                <div style={{ marginTop: 6, fontSize: 10, color: colors.muted2 }}>~${t.costUsd.toFixed(4)}</div>
              ) : null}
            </div>
            {t.role === 'assistant' && t.quoteDraft ? (
              <div
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '96%',
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${colors.border}`,
                  background: 'rgba(232,93,4,0.08)',
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FilePlus2 size={14} /> Proposed draft quotation
                </div>
                <div>
                  <strong>{t.quoteDraft.client}</strong> · {divisionLabel(t.quoteDraft.division_code)}
                </div>
                {t.quoteDraft.description ? <div style={{ color: colors.muted }}>{t.quoteDraft.description}</div> : null}
                <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                  {t.quoteDraft.items.map((line, li) => (
                    <li key={`${line.description}-${li}`}>
                      {line.description} · {line.qty} × {formatAED(line.unit_price)}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={creatingKey != null}
                  onClick={() => void confirmDraft(i, t.quoteDraft!)}
                >
                  {creatingKey === i ? 'Saving…' : 'Create draft quotation'}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <div style={{ fontSize: 12, color: colors.muted2 }}>Thinking…</div> : null}
        {error ? <div style={{ fontSize: 12, color: colors.danger }}>{error}</div> : null}
        {createdQuoteId ? (
          <div style={{ fontSize: 12, color: colors.success }}>
            Draft saved.{' '}
            <Link to="/app/quotations" style={{ color: colors.accent }}>
              Open quotations
            </Link>
          </div>
        ) : null}
      </div>

      <div style={{ padding: '0 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CRM_ASK_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            style={{ ...btn, padding: '4px 8px', fontSize: 11, borderRadius: 999 }}
            onClick={() => {
              if (s.endsWith('…')) {
                setDraft('Draft a quotation for ')
                return
              }
              void ask(s)
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${colors.border}` }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask, or draft a quotation…"
          disabled={busy}
          style={{ ...input, flex: 1 }}
        />
        <button type="submit" style={btnPrimary} disabled={busy || !draft.trim()} aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
