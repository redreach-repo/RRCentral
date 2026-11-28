import { useCallback, useEffect, useId, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import {
  CHASE_CHANNELS,
  chaseChannelLabel,
  currentCallback,
  isoDate,
  QUOTE_RESPONSES,
  quoteResponseLabel,
  sortQuoteChaseLog,
  type ChaseChannel,
  type QuoteChaseEntry,
  type QuoteResponse,
} from '../../lib/quoteChase'
import { addQuoteChaseNote, listQuoteChaseLog, quoteChaseNoteProblem } from '../../lib/quoteChaseStore'
import { errorMessage } from '../../lib/errors'
import { roleAtLeast } from '../../lib/permissions'
import { buttonPrimaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'

const ICONS: Record<ChaseChannel, typeof Mail> = { email: Mail, call: Phone, whatsapp: MessageCircle, visit: MapPin }

function day(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return format(parseISO(iso.slice(0, 10)), 'd MMM yyyy')
  } catch {
    return iso
  }
}

/**
 * The follow-up log of one sent quote: every email, call, WhatsApp or visit,
 * who was spoken to, what the client answered and any agreed call-back date.
 * Sales and up add entries; viewers read. Logging a follow-up never changes
 * the quote: Awarded, Not awarded and revisions stay buttons on the quote.
 */
export default function QuoteChasePanel(props: { quotationId: string; reference: string; onAdded?: () => void }) {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const canAdd = roleAtLeast(userRole, 'sales')
  const ids = useId()
  const [log, setLog] = useState<QuoteChaseEntry[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const today = isoDate(new Date())
  const [form, setForm] = useState({
    chased_on: today,
    channel: 'call' as ChaseChannel,
    contact: '',
    note: '',
    response: '' as QuoteResponse | '',
    next_follow_up: '',
  })

  const load = useCallback(async () => {
    try {
      const res = await listQuoteChaseLog(props.quotationId)
      setLog(sortQuoteChaseLog(res.log))
      setMissing(res.missing)
    } catch (e) {
      setLog([])
      showToast(errorMessage(e), 'error')
    }
  }, [props.quotationId, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    const input = { quotation_id: props.quotationId, ...form, next_follow_up: form.next_follow_up || null }
    const problem = quoteChaseNoteProblem(input)
    if (problem) {
      showToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      await addQuoteChaseNote(input)
      setForm({ chased_on: today, channel: form.channel, contact: form.contact, note: '', response: '', next_follow_up: '' })
      showToast('Follow-up logged.', 'success')
      await load()
      props.onAdded?.()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const callback = log ? currentCallback(log, today) : null

  return (
    <section aria-label={`Follow-up log for ${props.reference}`} style={{ display: 'grid', gap: 14 }}>
      {missing ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: colors.warn }}>
          The follow-up log is not set up in the database yet. Run the quote follow-up SQL (quote-chase.sql) first.
        </p>
      ) : null}

      {callback ? (
        <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: callback.state === 'missed' ? colors.danger : colors.warn }}>
          {callback.state === 'missed'
            ? `Missed call-back: you agreed to follow up on ${day(callback.date)}.`
            : `Call back on ${day(callback.date)} as agreed.`}
        </p>
      ) : null}

      {canAdd && !missing ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
            <div>
              <label htmlFor={`${ids}-date`} style={labelStyle}>
                Date
              </label>
              <input
                id={`${ids}-date`}
                type="date"
                style={inputStyle}
                value={form.chased_on}
                max={today}
                onChange={(e) => setForm((f) => ({ ...f, chased_on: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-channel`} style={labelStyle}>
                Channel
              </label>
              <select
                id={`${ids}-channel`}
                style={inputStyle}
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as ChaseChannel }))}
              >
                {CHASE_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${ids}-contact`} style={labelStyle}>
                Contact
              </label>
              <input
                id={`${ids}-contact`}
                style={inputStyle}
                value={form.contact}
                maxLength={200}
                placeholder="Who you spoke to"
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-response`} style={labelStyle}>
                Client’s answer
              </label>
              <select
                id={`${ids}-response`}
                style={inputStyle}
                value={form.response}
                onChange={(e) => setForm((f) => ({ ...f, response: e.target.value as QuoteResponse | '' }))}
              >
                <option value="">Not recorded</option>
                {QUOTE_RESPONSES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${ids}-callback`} style={labelStyle}>
                Call back on
              </label>
              <input
                id={`${ids}-callback`}
                type="date"
                style={inputStyle}
                value={form.next_follow_up}
                min={form.chased_on}
                onChange={(e) => setForm((f) => ({ ...f, next_follow_up: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${ids}-note`} style={labelStyle}>
              Note
            </label>
            <textarea
              id={`${ids}-note`}
              style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
              value={form.note}
              maxLength={4000}
              placeholder="What was said"
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          {form.response === 'declined' ? (
            <p role="note" style={{ margin: 0, fontSize: 13, color: colors.muted }}>
              Logging this does not close the quote. Use Outcome on the quote to mark it Not awarded with the reason.
            </p>
          ) : null}
          <div>
            <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Log follow-up'}
            </button>
          </div>
        </div>
      ) : null}

      {log === null ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Loading the follow-up log…</p>
      ) : log.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No follow-ups logged for {props.reference} yet.</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {log.map((e) => {
            const Icon = ICONS[e.channel] || Mail
            return (
              <li key={e.id} style={{ borderLeft: `2px solid ${colors.border}`, paddingLeft: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <Icon size={14} aria-hidden />
                  <strong>{day(e.chased_on)}</strong>
                  <span>{chaseChannelLabel(e.channel)}</span>
                  {e.contact ? <span style={{ color: colors.muted }}>with {e.contact}</span> : null}
                  {e.response ? (
                    <span style={{ color: e.response === 'declined' ? colors.danger : e.response === 'interested' ? colors.success : colors.text }}>
                      {quoteResponseLabel(e.response)}
                    </span>
                  ) : null}
                  {e.next_follow_up ? <span style={{ color: colors.warn }}>call back {day(e.next_follow_up)}</span> : null}
                </div>
                {e.note ? <p style={{ margin: '4px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{e.note}</p> : null}
                <div style={{ fontSize: 12, color: colors.muted2, marginTop: 2 }}>
                  {e.created_by_email || 'Unknown'}
                  {e.source === 'ai' ? ' (via AI assistant)' : ''}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
