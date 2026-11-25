import { useCallback, useEffect, useId, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { CHASE_CHANNELS, chaseChannelLabel, currentPromise, isoDate, sortChaseLog, type ChaseChannel, type ChaseLogEntry } from '../../lib/arChase'
import { addChaseNote, chaseNoteProblem, listChaseLog } from '../../lib/arChaseStore'
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
 * The chase log of one invoice: every email, call, WhatsApp or visit, who
 * spoke to whom, and any promised payment date. Sales and up add entries;
 * viewers read. A passed promise with money still owing shows as broken.
 */
export default function InvoiceChasePanel(props: {
  invoiceId: string
  reference: string
  /** What is still owing, to tell a broken promise from a kept one. */
  balance?: number
  onAdded?: () => void
}) {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const canAdd = roleAtLeast(userRole, 'sales')
  const ids = useId()
  const [log, setLog] = useState<ChaseLogEntry[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const today = isoDate(new Date())
  const [form, setForm] = useState({ chased_on: today, channel: 'call' as ChaseChannel, contact: '', note: '', promised_date: '' })

  const load = useCallback(async () => {
    try {
      const res = await listChaseLog(props.invoiceId)
      setLog(sortChaseLog(res.log))
      setMissing(res.missing)
    } catch (e) {
      setLog([])
      showToast(errorMessage(e), 'error')
    }
  }, [props.invoiceId, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    const input = { invoice_id: props.invoiceId, ...form, promised_date: form.promised_date || null }
    const problem = chaseNoteProblem(input)
    if (problem) {
      showToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      await addChaseNote(input)
      setForm({ chased_on: today, channel: form.channel, contact: form.contact, note: '', promised_date: '' })
      showToast('Chase logged.', 'success')
      await load()
      props.onAdded?.()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const promise = log ? currentPromise(log, props.balance ?? 1, today) : null

  return (
    <section aria-label={`Chase log for ${props.reference}`} style={{ display: 'grid', gap: 14 }}>
      {missing ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: colors.warn }}>
          The chase log is not set up in the database yet. Run the overdue invoice chasing SQL (ar-chase.sql) first.
        </p>
      ) : null}

      {promise ? (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: promise.state === 'broken' ? colors.danger : promise.state === 'pending' ? colors.warn : colors.success,
          }}
        >
          {promise.state === 'broken'
            ? `Broken promise: payment was promised by ${day(promise.date)}.`
            : promise.state === 'pending'
              ? `Payment promised by ${day(promise.date)}.`
              : `Promise of ${day(promise.date)} kept.`}
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
              <label htmlFor={`${ids}-promise`} style={labelStyle}>
                Promised payment date
              </label>
              <input
                id={`${ids}-promise`}
                type="date"
                style={inputStyle}
                value={form.promised_date}
                min={form.chased_on}
                onChange={(e) => setForm((f) => ({ ...f, promised_date: e.target.value }))}
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
          <div>
            <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Log chase'}
            </button>
          </div>
        </div>
      ) : null}

      {log === null ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Loading the chase log…</p>
      ) : log.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No chases logged for {props.reference} yet.</p>
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
                  {e.promised_date ? <span style={{ color: colors.warn }}>promised {day(e.promised_date)}</span> : null}
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
