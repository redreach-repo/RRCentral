import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { buildCrmAskFacts, CRM_ASK_SUGGESTIONS } from '../lib/crmAsk'
import { resolveSalesOwnerName } from '../lib/crmWorkQueue'
import { errorMessage } from '../lib/errors'
import { runCrmAsk, AI_LOCAL_MODE } from '../lib/aiAssistStore'
import { isSupabaseConfigured } from '../lib/supabaseConfig'
import type { AppUser, CrmEntry } from '../lib/types'
import { btn, btnGhost, btnPrimary, colors, input } from '../lib/pageStyles'

type ChatTurn = { role: 'user' | 'assistant'; text: string; costUsd?: number }

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

/**
 * Read-only Claude chat over the CRM deals already loaded on Pipeline.
 * Suggests actions in prose only — never writes to the CRM.
 */
export default function CrmAskPanel({ entries, owners }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [error, setError] = useState('')
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
  }, [open, turns, busy])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    if (!facts.length) {
      setError('Load some CRM companies first, then ask again.')
      return
    }
    setError('')
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
      setTurns((t) => [...t, { role: 'assistant', text: r.text, costUsd: r.costUsd }])
    } catch (e) {
      setError(errorMessage(e, 'Ask RR is not available right now.'))
      setTurns((t) => t.slice(0, -1))
      setDraft(q)
    } finally {
      setBusy(false)
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
          <div style={{ fontSize: 11, color: colors.muted2 }}>Read-only · answers from your loaded CRM</div>
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
            Ask about overdue follow-ups, a company, or your pipeline. Claude only uses the deals already on this
            page — it cannot change CRM records.
          </div>
        ) : null}
        {turns.map((t, i) => (
          <div
            key={`${t.role}-${i}`}
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
        ))}
        {busy ? <div style={{ fontSize: 12, color: colors.muted2 }}>Thinking…</div> : null}
        {error ? <div style={{ fontSize: 12, color: colors.danger }}>{error}</div> : null}
      </div>

      <div style={{ padding: '0 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CRM_ASK_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            style={{ ...btn, padding: '4px 8px', fontSize: 11, borderRadius: 999 }}
            onClick={() => void ask(s)}
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
          placeholder="Ask about your pipeline…"
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
