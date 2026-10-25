import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import {
  CALL_OUTCOMES,
  QUICK_LEAD_PIPELINES,
  QUICK_MIN_DIGITS,
  cleanPhoneInput,
  quickCallBody,
  quickLeadProblem,
  quickMatches,
  type CallOutcome,
  type QuickLeadPipeline,
  type QuickMatch,
} from '../lib/quickAdd'
import { loadQuickData, logQuickCall, saveQuickLead, type QuickData } from '../lib/quickAddStore'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, pageStyle, pageTitleStyle, selectStyle } from '../lib/uiStyles'

const big: CSSProperties = { ...inputStyle, fontSize: 22, padding: '12px 14px', letterSpacing: 1 }
const chip = (on: boolean): CSSProperties => ({
  ...buttonSecondaryStyle,
  padding: '8px 12px',
  fontSize: 13,
  borderColor: on ? colors.accent : colors.border,
  color: on ? colors.text : colors.muted,
})

const SOURCES = ['Phone call', 'Referral', 'Walk in', 'Event', 'WhatsApp', 'Website', 'Other']

/**
 * Quick add: phone first. Type the number; a known contact or CRM lead shows
 * up and one tap logs the call. A new number becomes a lead with just a name.
 */
export default function QuickAddPage() {
  const { user, appUserId, userRole } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<QuickData | null>(null)
  const [phone, setPhone] = useState('')
  const [picked, setPicked] = useState<QuickMatch | null>(null)
  const [outcome, setOutcome] = useState<CallOutcome>('Spoke to them')
  const [note, setNote] = useState('')
  const [lead, setLead] = useState({ name: '', company: '', email: '', source: 'Phone call', pipeline: 'ai_crm' as QuickLeadPipeline })
  const [busy, setBusy] = useState(false)
  const author = { appUserId, email: user?.email || '', name: '' }

  useEffect(() => {
    loadQuickData()
      .then(setData)
      .catch((e) => showToast(errorMessage(e, 'Could not load contacts'), 'error'))
    phoneRef.current?.focus()
  }, [showToast])

  const digits = phone.replace(/\D/g, '').length
  const ready = digits >= QUICK_MIN_DIGITS
  const matches = useMemo(() => (data && ready ? quickMatches(phone, data, data.countryCode) : []), [data, phone, ready])
  const current = picked && matches.some((m) => m.id === picked.id) ? picked : matches[0] ?? null

  function reset() {
    setPhone('')
    setPicked(null)
    setNote('')
    setOutcome('Spoke to them')
    setLead((l) => ({ ...l, name: '', company: '', email: '' }))
    phoneRef.current?.focus()
  }

  async function logCall() {
    if (!current) return
    setBusy(true)
    try {
      await logQuickCall(current, quickCallBody(outcome, note), author)
      showToast(`Call logged on ${current.kind === 'contact' ? current.accountName : current.company}`, 'success')
      reset()
    } catch (e) {
      showToast(errorMessage(e, 'Could not log the call'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function addLead(open: boolean) {
    const problem = quickLeadProblem({ phone, name: lead.name, email: lead.email }, data?.countryCode)
    if (problem) return showToast(problem, 'error')
    setBusy(true)
    try {
      const refs = (data?.accounts || []).map((a) => a.reference)
      const r = await saveQuickLead({ ...lead, phone, note }, refs, author)
      showToast(`Lead added: ${lead.company.trim() || lead.name.trim()}`, 'success')
      if (open) navigate(r.path)
      else {
        reset()
        setData(await loadQuickData())
      }
    } catch (e) {
      showToast(errorMessage(e, 'Could not add the lead'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (userRole === 'viewer' || userRole === 'staff') {
    return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>Quick add</h1>
        <p style={{ color: colors.muted }}>Quick add is for the sales team. Log calls on the account timeline instead.</p>
      </div>
    )
  }

  return (
    <div style={{ ...pageStyle, maxWidth: 620 }}>
      <h1 style={pageTitleStyle}>Quick add</h1>
      <section style={cardStyle}>
        <label style={labelStyle} htmlFor="quick-phone">
          Phone number
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Phone size={20} color={colors.muted} />
          <input
            id="quick-phone"
            ref={phoneRef}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="050 123 4567"
            style={big}
            value={phone}
            onChange={(e) => {
              setPhone(cleanPhoneInput(e.target.value))
              setPicked(null)
            }}
            // Enter moves on: to the note for a known number, to the name for a new one.
            onKeyDown={(e) => e.key === 'Enter' && (matches.length ? noteRef : nameRef).current?.focus()}
          />
        </div>
        {!data ? <p style={{ color: colors.muted, fontSize: 13 }}>Loading contacts…</p> : null}
        {data && !ready ? <p style={{ color: colors.muted, fontSize: 13, marginBottom: 0 }}>Type at least {QUICK_MIN_DIGITS} digits.</p> : null}
      </section>

      {ready && data ? (
        <section style={{ ...cardStyle, marginTop: 12 }}>
          {matches.length ? (
            <>
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>
                {matches.length === 1 ? 'Known number' : `${matches.length} matches, pick one`}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {matches.map((m) => (
                  <button key={`${m.kind}-${m.id}`} type="button" style={chip(current?.id === m.id)} onClick={() => setPicked(m)}>
                    {m.kind === 'contact' ? `${m.name || 'Contact'}, ${m.accountName}` : `${m.name || m.company} (CRM, ${m.stage})`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {CALL_OUTCOMES.map((o) => (
                  <button key={o} type="button" style={chip(outcome === o)} onClick={() => setOutcome(o)}>
                    {o}
                  </button>
                ))}
              </div>
              <input
                style={{ ...inputStyle, marginTop: 12 }}
                ref={noteRef}
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void logCall()}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void logCall()}>
                  {busy ? 'Saving…' : 'Log the call'}
                </button>
                {current?.kind === 'contact' ? (
                  <Link to={`/accounts/${current.accountId}`} style={{ color: colors.accent, fontSize: 13 }}>
                    Open the account
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>New number. Add it as a lead.</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <input
                  style={inputStyle}
                  ref={nameRef}
                  placeholder="Name"
                  value={lead.name}
                  onChange={(e) => setLead({ ...lead, name: e.target.value })}
                />
                <input style={inputStyle} placeholder="Company (optional)" value={lead.company} onChange={(e) => setLead({ ...lead, company: e.target.value })} />
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="Email (optional)"
                  value={lead.email}
                  onChange={(e) => setLead({ ...lead, email: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {QUICK_LEAD_PIPELINES.map((p) => (
                    <button key={p.value} type="button" style={chip(lead.pipeline === p.value)} onClick={() => setLead({ ...lead, pipeline: p.value })}>
                      {p.label}
                    </button>
                  ))}
                  <select
                    aria-label="Source"
                    style={{ ...selectStyle, width: 'auto', padding: '8px 10px', fontSize: 13 }}
                    value={lead.source}
                    onChange={(e) => setLead({ ...lead, source: e.target.value })}
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  style={inputStyle}
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void addLead(false)}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" style={buttonPrimaryStyle} disabled={busy || lead.name.trim().length < 2} onClick={() => void addLead(false)}>
                  {busy ? 'Saving…' : 'Add lead'}
                </button>
                <button type="button" style={buttonSecondaryStyle} disabled={busy || lead.name.trim().length < 2} onClick={() => void addLead(true)}>
                  Add and open
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}
