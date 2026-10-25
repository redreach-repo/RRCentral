import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addMonths, format, startOfMonth } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { CLIENT_REPORT_STATUSES, CLIENT_REPORT_SUMMARY_MAX, monthLabelOf, reportMonthFor, reportRecipients } from '../lib/clientReports'
import { buildReportDrafts, loadReportQueue, saveReportSummary, sendReport, setReportSkipped, type ReportContact, type ReportQueue } from '../lib/clientReportsStore'
import { errorMessage } from '../lib/errors'
import { roleAtLeast } from '../lib/permissions'
import type { ClientReportDraft } from '../lib/types'
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
 * The Approve queue for monthly client reports. On the 1st each AI CRM client
 * gets a draft with an AI written summary; nothing goes to the client until
 * someone checks it here and presses Send.
 */
export default function ClientReportsPage() {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const months = useMemo(() => {
    const latest = reportMonthFor(new Date())
    return Array.from({ length: 6 }, (_, i) => format(addMonths(startOfMonth(new Date(`${latest}T12:00:00`)), -i), 'yyyy-MM-01'))
  }, [])
  const [month, setMonth] = useState(months[0])
  const [queue, setQueue] = useState<ReportQueue | null>(null)
  const [building, setBuilding] = useState(false)

  const load = useCallback(async () => {
    try {
      setQueue(await loadReportQueue(month))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the reports'), 'error')
      setQueue({ drafts: [], contacts: [], missingTable: false })
    }
  }, [month, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function build() {
    setBuilding(true)
    const r = await buildReportDrafts(month)
    setBuilding(false)
    if (!r.ok) return showToast(r.message, 'error')
    const n = r.data.drafted.length
    showToast(n ? `${n} new ${n === 1 ? 'draft' : 'drafts'} to check` : 'Every client already has a draft for this month', 'success')
    if (r.data.problems.length) showToast(`Not drafted: ${r.data.problems.join('; ')}`, 'error')
    await load()
  }

  const waiting = queue?.drafts.filter((d) => d.status === 'draft').length ?? 0
  const sent = queue?.drafts.filter((d) => d.status === 'sent').length ?? 0

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Monthly reports</h1>
      <p style={pageSubtitleStyle}>
        On the 1st each AI CRM client gets a report for the month before, with a summary drafted by AI. Check the summary, fix
        anything, then send it. Nothing goes to a client without someone pressing Send.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 16px' }}>
        <select aria-label="Report month" style={{ ...selectStyle, width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabelOf(m)}
            </option>
          ))}
        </select>
        <span style={muted}>
          {queue ? `${waiting} waiting for approval, ${sent} sent` : 'Loading…'}
        </span>
        {roleAtLeast(userRole, 'manager') && !queue?.missingTable ? (
          <button type="button" style={smallBtn} disabled={building} onClick={() => void build()}>
            {building ? 'Building…' : 'Build missing drafts now'}
          </button>
        ) : null}
      </div>

      {queue?.missingTable ? (
        <p style={{ color: colors.warn }}>The monthly reports table is not set up yet. Run the monthly reports SQL first.</p>
      ) : queue && queue.drafts.length === 0 ? (
        <section style={cardStyle}>
          <p style={{ ...muted, margin: 0 }}>
            No reports for {monthLabelOf(month)} yet. They are drafted on the 1st for every AI CRM client with an active contract.
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
  draft: ClientReportDraft & { accountName: string }
  contacts: ReportContact[]
  canSend: boolean
  canEdit: boolean
  onChanged: () => Promise<void>
}) {
  const { showToast } = useToast()
  const [summary, setSummary] = useState(draft.summary)
  const [busy, setBusy] = useState('')
  const [showFacts, setShowFacts] = useState(false)
  const to = reportRecipients(contacts)
  const status = CLIENT_REPORT_STATUSES.find((s) => s.value === draft.status)?.label ?? draft.status
  const open = draft.status === 'draft'
  const changed = summary.trim() !== draft.summary.trim()

  async function save() {
    setBusy('save')
    try {
      await saveReportSummary(draft.id, summary)
      showToast('Summary saved', 'success')
      await onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the summary'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function send(channels: ('email' | 'whatsapp')[]) {
    const where = channels.map((c) => (c === 'email' ? `email to ${to.email?.to}` : `WhatsApp to ${to.whatsapp?.to}`)).join(' and ')
    if (!window.confirm(`Send the ${monthLabelOf(draft.month)} report to ${draft.accountName} by ${where}?`)) return
    setBusy('send')
    const r = await sendReport(draft.id, channels, summary)
    setBusy('')
    if (!r.ok) {
      showToast(r.message, 'error')
    } else {
      showToast(`Sent by ${r.data.sent.map((s) => (s.channel === 'email' ? 'email' : 'WhatsApp')).join(' and ')}`, 'success')
      if (r.data.failed.length) showToast(`Not sent: ${r.data.failed.join('; ')}`, 'error')
    }
    await onChanged()
  }

  async function skip(skipped: boolean) {
    setBusy('skip')
    try {
      await setReportSkipped(draft.id, skipped)
      await onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not change the report'), 'error')
    } finally {
      setBusy('')
    }
  }

  const both: ('email' | 'whatsapp')[] = [...(to.email ? ['email' as const] : []), ...(to.whatsapp ? ['whatsapp' as const] : [])]

  return (
    <section style={cardStyle} aria-label={`${draft.accountName} report`}>
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
          ? [draft.sent_email_to && `Email: ${draft.sent_email_to}`, draft.sent_whatsapp_to && `WhatsApp: ${draft.sent_whatsapp_to}`].filter(Boolean).join(', ')
          : `To ${to.email ? to.email.contact.name || to.email.to : 'nobody by email'}${to.whatsapp ? `, WhatsApp ${to.whatsapp.to}` : ', no WhatsApp number'}`}
        {' · '}
        <Link to={`/accounts/${draft.account_id}/report?month=${draft.month.slice(0, 7)}`} style={{ color: colors.accent }}>
          Full report
        </Link>
        {draft.ai_cost_usd ? ` · AI draft $${Number(draft.ai_cost_usd).toFixed(4)}` : ''}
      </p>

      {draft.error ? <p style={{ color: colors.warn, fontSize: 13, margin: '0 0 8px' }}>{draft.error}</p> : null}

      {open && canEdit ? (
        <textarea
          aria-label="Summary"
          style={{ ...inputStyle, minHeight: 130, resize: 'vertical', lineHeight: 1.5 }}
          maxLength={CLIENT_REPORT_SUMMARY_MAX}
          value={summary}
          placeholder="Write the summary the client will read."
          onChange={(e) => setSummary(e.target.value)}
        />
      ) : (
        <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: 0 }}>{draft.summary || 'No summary.'}</p>
      )}

      <button type="button" onClick={() => setShowFacts((v) => !v)} style={{ ...smallBtn, marginTop: 8, border: 'none', paddingLeft: 0 }}>
        {showFacts ? 'Hide the numbers' : 'Show the numbers that go with it'}
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
              <button
                type="button"
                style={buttonPrimaryStyle}
                disabled={!!busy || !both.length || !summary.trim()}
                onClick={() => void send(both)}
              >
                {busy === 'send' ? 'Sending…' : both.length === 2 ? 'Approve and send by email and WhatsApp' : both[0] === 'whatsapp' ? 'Approve and send by WhatsApp' : 'Approve and send by email'}
              </button>
              {both.length === 2 ? (
                <>
                  <button type="button" style={smallBtn} disabled={!!busy} onClick={() => void send(['email'])}>
                    Email only
                  </button>
                  <button type="button" style={smallBtn} disabled={!!busy} onClick={() => void send(['whatsapp'])}>
                    WhatsApp only
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <span style={muted}>An admin, manager or sales person sends it.</span>
          )}
          {changed ? (
            <button type="button" style={smallBtn} disabled={!!busy} onClick={() => void save()}>
              Save summary
            </button>
          ) : null}
          <button type="button" style={smallBtn} disabled={!!busy} onClick={() => void skip(true)}>
            Skip this month
          </button>
        </div>
      ) : null}
      {draft.status === 'skipped' && canEdit ? (
        <button type="button" style={{ ...smallBtn, marginTop: 10 }} disabled={!!busy} onClick={() => void skip(false)}>
          Put back in the queue
        </button>
      ) : null}
    </section>
  )
}
