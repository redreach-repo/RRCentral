import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Send, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { digestCount, digestDateLabel, digestSections, type Digest } from '../../lib/dailyDigest'
import {
  CHANNEL_STATUS_LABEL,
  deleteRecipient,
  listDigestRuns,
  listRecipients,
  loadDigestPreview,
  saveRecipient,
  sendDigestNow,
  type RecipientInput,
} from '../../lib/dailyDigestStore'
import { errorMessage } from '../../lib/errors'
import type { DigestRecipientRow, DigestRun } from '../../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
} from '../../lib/uiStyles'

const BLANK: RecipientInput = { name: '', email: '', whatsapp_phone: '', by_email: true, by_whatsapp: false, active: true }
const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }
const row = { display: 'flex', flexWrap: 'wrap' as const, gap: 8, alignItems: 'center' }

/**
 * The morning digest: who gets it, a preview of today's, and Send now.
 * The schedule itself runs on the server (docs/daily-digest.md).
 */
export default function DailyDigestCard() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [recipients, setRecipients] = useState<DigestRecipientRow[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [runs, setRuns] = useState<DigestRun[]>([])
  const [preview, setPreview] = useState<Digest | null>(null)
  const [draft, setDraft] = useState<RecipientInput>(BLANK)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const [list, lastRuns] = await Promise.all([listRecipients(), listDigestRuns()])
      setRecipients(list.rows)
      setMissingTable(list.missingTable)
      setRuns(lastRuns)
    } catch {
      setRecipients([])
    }
    try {
      setPreview(await loadDigestPreview())
    } catch {
      setPreview(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    setBusy('add')
    try {
      const problem = await saveRecipient(draft, user?.email || '')
      if (problem) {
        showToast(problem, 'error')
        return
      }
      setDraft(BLANK)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not add to the digest list'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function toggle(r: DigestRecipientRow, patch: Partial<RecipientInput>) {
    setBusy(r.id)
    try {
      const next = { ...r, ...patch }
      const problem = await saveRecipient(next, user?.email || '', r.id)
      if (problem) showToast(problem, 'error')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function remove(r: DigestRecipientRow) {
    setBusy(r.id)
    try {
      await deleteRecipient(r.id)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not remove'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function sendNow() {
    setBusy('send')
    try {
      const r = await sendDigestNow()
      if (!r.ok) showToast(r.message, 'error')
      else if (r.emailsSent + r.whatsappSent === 0) {
        showToast(
          `Nothing was sent. Email ${CHANNEL_STATUS_LABEL[r.email] ?? r.email}, WhatsApp ${
            CHANNEL_STATUS_LABEL[r.whatsapp] ?? r.whatsapp
          }. ${r.message}`,
          'error',
        )
      } else {
        const bits = [r.emailsSent ? `${r.emailsSent} email${r.emailsSent === 1 ? '' : 's'}` : '', r.whatsappSent ? `${r.whatsappSent} WhatsApp` : '']
        showToast(`Digest sent: ${bits.filter(Boolean).join(' and ')}.${r.message ? ` ${r.message}` : ''}`, 'success')
      }
      await load()
    } finally {
      setBusy('')
    }
  }

  const last = runs[0]

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="Daily digest">
      <h2 style={sectionTitleStyle}>Daily digest</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
        Every morning at 8:00 (UAE time), the people below get a short list of what needs attention: tickets near or past
        their reply time, renewals in the next 60 days, overdue CTRM next actions and clients over their hours. Email has
        the full list with links. WhatsApp has the counts. Days with nothing to report are skipped.
      </p>

      {missingTable ? (
        <p style={{ color: colors.warn, fontSize: 13, margin: '0 0 12px' }}>
          Run the daily digest SQL in Supabase first, then reload this page.
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
            {recipients.length === 0 ? (
              <li style={{ color: colors.muted, fontSize: 13 }}>Nobody is on the list yet.</li>
            ) : null}
            {recipients.map((r) => (
              <li key={r.id} style={{ ...row, justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${colors.border}`, fontSize: 13 }}>
                <span style={{ minWidth: 0, flex: '1 1 220px', color: r.active ? colors.text : colors.muted }}>
                  <strong>{r.name || r.email || r.whatsapp_phone}</strong>{' '}
                  <span style={{ color: colors.muted }}>
                    {[r.by_email ? r.email : '', r.by_whatsapp ? `WhatsApp +${r.whatsapp_phone}` : ''].filter(Boolean).join(', ')}
                    {r.active ? '' : ' (paused)'}
                  </span>
                </span>
                <span style={row}>
                  <button type="button" style={smallBtn} disabled={busy === r.id} onClick={() => void toggle(r, { active: !r.active })}>
                    {r.active ? 'Pause' : 'Resume'}
                  </button>
                  <button type="button" style={smallBtn} disabled={busy === r.id} onClick={() => void remove(r)} aria-label={`Remove ${r.name || r.email}`}>
                    <Trash2 size={12} /> Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))',
              alignItems: 'end',
              marginBottom: 12,
            }}
          >
            <div>
              <label style={labelStyle} htmlFor="digest-name">Name</label>
              <input id="digest-name" style={inputStyle} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="digest-email">Email</label>
              <input id="digest-email" style={inputStyle} type="email" value={draft.email} placeholder="name@redreach.ae"
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="digest-phone">WhatsApp number</label>
              <input id="digest-phone" style={inputStyle} inputMode="tel" value={draft.whatsapp_phone} placeholder="971501234567"
                onChange={(e) => setDraft((d) => ({ ...d, whatsapp_phone: e.target.value }))} />
            </div>
            <div style={{ ...row, paddingBottom: 6, fontSize: 13 }}>
              <label style={row}>
                <input type="checkbox" checked={draft.by_email} onChange={(e) => setDraft((d) => ({ ...d, by_email: e.target.checked }))} /> Email
              </label>
              <label style={row}>
                <input type="checkbox" checked={draft.by_whatsapp} onChange={(e) => setDraft((d) => ({ ...d, by_whatsapp: e.target.checked }))} /> WhatsApp
              </label>
              <button type="button" style={smallBtn} disabled={busy === 'add'} onClick={() => void add()}>
                Add
              </button>
            </div>
          </div>
        </>
      )}

      <div style={{ ...row, marginBottom: 12 }}>
        <button type="button" style={buttonPrimaryStyle} disabled={busy === 'send' || missingTable} onClick={() => void sendNow()}>
          <Send size={14} /> {busy === 'send' ? 'Sending…' : 'Send now'}
        </button>
        {last ? (
          <span style={{ fontSize: 13, color: colors.muted }}>
            Last sent {format(parseISO(last.started_at), 'd MMM yyyy, HH:mm')} ({last.trigger === 'schedule' ? 'daily' : last.requested_by || 'by hand'}):
            email {CHANNEL_STATUS_LABEL[last.email_status] ?? last.email_status}, WhatsApp{' '}
            {CHANNEL_STATUS_LABEL[last.whatsapp_status] ?? last.whatsapp_status}.
            {last.message ? <span style={{ display: 'block', color: colors.muted2, marginTop: 4 }}>{last.message}</span> : null}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: colors.muted }}>No digest has been sent yet.</span>
        )}
      </div>

      {preview ? <Preview digest={preview} /> : null}
    </section>
  )
}

function Preview({ digest }: { digest: Digest }) {
  const count = digestCount(digest)
  return (
    <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        Today&apos;s digest, {digestDateLabel(digest)}: {count === 0 ? 'all clear' : `${count} ${count === 1 ? 'thing needs' : 'things need'} attention`}
      </div>
      {digestSections(digest).map((s) => (
        <div key={s.key} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: colors.muted2, marginBottom: 4 }}>
            {s.title} ({s.items.length})
          </div>
          {s.items.length === 0 ? (
            <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>{s.empty}</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, color: colors.muted, fontSize: 13, lineHeight: 1.55 }}>
              {s.items.slice(0, 6).map((item) => (
                <li key={item.path + item.detail}>
                  <Link to={item.path} style={{ color: colors.text, fontWeight: 600 }}>
                    {item.name}
                  </Link>
                  <span style={{ color: item.urgent ? colors.danger : colors.warn }}>, {item.detail}</span>
                </li>
              ))}
              {s.items.length > 6 ? <li style={{ listStyle: 'none' }}>and {s.items.length - 6} more</li> : null}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
