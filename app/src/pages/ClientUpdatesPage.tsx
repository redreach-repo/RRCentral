import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { runAi } from '../lib/aiAssistStore'
import { buildUpdateDrafts, loadUpdateQueue, saveUpdateBody, sendUpdate, setUpdateSkipped, type UpdateContact, type UpdateQueue } from '../lib/clientUpdatesStore'
import { errorMessage } from '../lib/errors'
import { roleAtLeast } from '../lib/permissions'
import type { ClientUpdateDraft } from '../lib/types'
import { CLIENT_UPDATE_BODY_MAX, CLIENT_UPDATE_STATUSES, updateRecipients, weekLabelOf, weekStartFor, whatsAppLink, type ClientUpdateChannel } from '../lib/weeklyUpdates'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  selectStyle,
} from '../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 13 }
const muted = { color: colors.muted, fontSize: 13 }

/**
 * The Approve queue for weekly CTRM Next client updates. Every Thursday each
 * CTRM Next client with a signed deal gets a draft built from their issues and
 * sessions; nothing goes out until someone taps Send by email or WhatsApp.
 */
export default function ClientUpdatesPage() {
  const { userRole, user } = useAuth()
  const { showToast } = useToast()
  const weeks = useMemo(() => {
    const latest = parseISO(weekStartFor(new Date()))
    return Array.from({ length: 6 }, (_, i) => format(addDays(latest, -7 * i), 'yyyy-MM-dd'))
  }, [])
  const [week, setWeek] = useState(weeks[0])
  const [queue, setQueue] = useState<UpdateQueue | null>(null)
  const [building, setBuilding] = useState(false)

  const load = useCallback(async () => {
    try {
      setQueue(await loadUpdateQueue(week))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the updates'), 'error')
      setQueue({ drafts: [], contacts: [], missingTable: false })
    }
  }, [week, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function build() {
    setBuilding(true)
    const r = await buildUpdateDrafts(week, user?.email || '')
    setBuilding(false)
    if (!r.ok) return showToast(r.message, 'error')
    const n = r.data.drafted.length
    const quiet = r.data.nothing_to_say.length
    showToast(
      n
        ? `${n} new ${n === 1 ? 'draft' : 'drafts'} to check`
        : quiet
          ? `Nothing to report this week for ${r.data.nothing_to_say.join(', ')}`
          : 'Every CTRM Next client already has a draft for this week',
      'success',
    )
    if (r.data.problems.length) showToast(`Not drafted: ${r.data.problems.join('; ')}`, 'error')
    await load()
  }

  const waiting = queue?.drafts.filter((d) => d.status === 'draft').length ?? 0
  const sent = queue?.drafts.filter((d) => d.status === 'sent').length ?? 0

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Weekly updates</h1>
      <p style={pageSubtitleStyle}>
        Every Thursday each CTRM Next client gets a short update drafted from their issues and sessions: what was fixed this
        week, what is still open and what comes next. Check the wording, then send it by email or WhatsApp. Nothing goes to a
        client until someone taps Send.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 16px' }}>
        <select aria-label="Week" style={{ ...selectStyle, width: 'auto' }} value={week} onChange={(e) => setWeek(e.target.value)}>
          {weeks.map((w) => (
            <option key={w} value={w}>
              {weekLabelOf(w)}
            </option>
          ))}
        </select>
        <span style={muted}>{queue ? `${waiting} waiting for approval, ${sent} sent` : 'Loading…'}</span>
        {roleAtLeast(userRole, 'manager') && !queue?.missingTable ? (
          <button type="button" style={smallBtn} disabled={building} onClick={() => void build()}>
            {building ? 'Building…' : 'Build missing drafts now'}
          </button>
        ) : null}
      </div>

      {queue?.missingTable ? (
        <p style={{ color: colors.warn }}>The weekly updates table is not set up yet. Run the weekly updates SQL first.</p>
      ) : queue && queue.drafts.length === 0 ? (
        <section style={cardStyle}>
          <p style={{ ...muted, margin: 0 }}>
            No updates for the {weekLabelOf(week)} yet. They are drafted on Thursday for every CTRM Next client with a signed
            deal and something to report.
          </p>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {queue?.drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              contacts={queue.contacts.filter((c) => c.account_id === d.account_id)}
              canSend={roleAtLeast(userRole, 'sales')}
              canEdit={userRole !== 'viewer'}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DraftCard({
  draft,
  contacts,
  canSend,
  canEdit,
  onChanged,
}: {
  draft: ClientUpdateDraft & { accountName: string }
  contacts: UpdateContact[]
  canSend: boolean
  canEdit: boolean
  onChanged: () => Promise<void>
}) {
  const { user, appUserId } = useAuth()
  const { showToast } = useToast()
  const [body, setBody] = useState(draft.body)
  const [busy, setBusy] = useState('')
  const [showFacts, setShowFacts] = useState(false)
  const to = updateRecipients(contacts)
  const status = CLIENT_UPDATE_STATUSES.find((s) => s.value === draft.status)?.label ?? draft.status
  const open = draft.status === 'draft'
  const changed = body.trim() !== draft.body.trim()

  async function save() {
    setBusy('save')
    try {
      await saveUpdateBody(draft.id, body)
      showToast('Update saved', 'success')
      await onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the update'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function tidy() {
    setBusy('tidy')
    try {
      const r = await runAi(draft.account_id, { feature: 'update_tidy', accountName: draft.accountName, text: body })
      setBody(r.text)
      showToast('Wording tidied. Check it, then send or save.', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'AI help could not tidy the wording'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function send(channel: ClientUpdateChannel) {
    // Open the WhatsApp tab on the tap itself, so the browser does not block it.
    const tab = channel === 'whatsapp' ? window.open('', '_blank') : null
    setBusy(channel)
    const r = await sendUpdate(draft, channel, body, { appUserId, email: user?.email || '' })
    setBusy('')
    if (!r.ok) {
      tab?.close()
      showToast(r.message, 'error')
    } else if (channel === 'whatsapp') {
      const link = whatsAppLink(r.data.to, body)
      if (tab) tab.location.href = link
      else window.location.href = link
      showToast('WhatsApp is open with the update typed in. Press send there.', 'success')
    } else {
      showToast(`Emailed to ${r.data.to}`, 'success')
    }
    await onChanged()
  }

  async function skip(skipped: boolean) {
    setBusy('skip')
    try {
      await setUpdateSkipped(draft.id, skipped)
      await onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not change the update'), 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <section style={cardStyle} aria-label={`${draft.accountName} update`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>
          <Link to={`/accounts/${draft.account_id}`} style={{ color: colors.text }}>
            {draft.accountName}
          </Link>
        </h2>
        <span style={{ fontSize: 13, color: draft.status === 'sent' ? colors.success : draft.status === 'skipped' ? colors.muted : colors.warn }}>
          {status}
          {draft.status === 'sent' && draft.sent_at ? `, ${format(new Date(draft.sent_at), 'd MMM HH:mm')} by ${draft.sent_by}` : ''}
        </span>
      </div>
      <p style={{ ...muted, margin: '4px 0 10px' }}>
        {draft.status === 'sent'
          ? `${draft.sent_via === 'email' ? 'Email' : 'WhatsApp'}: ${draft.sent_to}`
          : `To ${to.email ? to.email.contact.name || to.email.to : 'nobody by email'}${to.whatsapp ? `, WhatsApp ${to.whatsapp.to}` : ', no WhatsApp number'}`}
      </p>

      {draft.error ? <p style={{ color: colors.warn, fontSize: 13, margin: '0 0 8px' }}>{draft.error}</p> : null}

      {open && canEdit ? (
        <textarea
          aria-label="Update"
          style={{ ...inputStyle, minHeight: 220, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
          maxLength={CLIENT_UPDATE_BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      ) : (
        <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: 0 }}>{draft.body || 'No text.'}</p>
      )}

      <button type="button" onClick={() => setShowFacts((v) => !v)} style={{ ...smallBtn, marginTop: 8, border: 'none', paddingLeft: 0 }}>
        {showFacts ? 'Hide what it was built from' : 'Show what it was built from'}
      </button>
      {showFacts ? (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          {(draft.facts || []).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}

      {open && canEdit ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {canSend ? (
            <>
              {to.email ? (
                <button type="button" style={buttonPrimaryStyle} disabled={!!busy || !body.trim()} onClick={() => void send('email')}>
                  {busy === 'email' ? 'Sending…' : 'Send by email'}
                </button>
              ) : null}
              {to.whatsapp ? (
                <button
                  type="button"
                  style={to.email ? smallBtn : buttonPrimaryStyle}
                  disabled={!!busy || !body.trim()}
                  onClick={() => void send('whatsapp')}
                >
                  {busy === 'whatsapp' ? 'Opening…' : 'Send by WhatsApp'}
                </button>
              ) : null}
            </>
          ) : (
            <span style={muted}>An admin, manager or sales person sends it.</span>
          )}
          <button type="button" style={smallBtn} disabled={!!busy || body.trim().length < 20} onClick={() => void tidy()}>
            {busy === 'tidy' ? 'Tidying…' : 'Tidy wording'}
          </button>
          {changed ? (
            <button type="button" style={smallBtn} disabled={!!busy} onClick={() => void save()}>
              Save
            </button>
          ) : null}
          <button type="button" style={smallBtn} disabled={!!busy} onClick={() => void skip(true)}>
            Skip this week
          </button>
        </div>
      ) : null}
      {open && canEdit ? <p style={{ ...muted, margin: '8px 0 0' }}>Tidy wording only changes how it reads. It cannot add facts.</p> : null}
      {draft.status === 'skipped' && canEdit ? (
        <button type="button" style={{ ...smallBtn, marginTop: 10 }} disabled={!!busy} onClick={() => void skip(false)}>
          Put back in the queue
        </button>
      ) : null}
    </section>
  )
}
