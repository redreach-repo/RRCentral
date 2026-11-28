import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, CheckCircle2, Mail, MessageCircle, SkipForward } from 'lucide-react'
import EmailComposeModal from '../components/EmailComposeModal'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import QuoteChasePanel from '../components/quotations/QuoteChasePanel'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import {
  divisionLabel,
  filterQuoteChaseRows,
  isoDate,
  parseFollowupDays,
  QUOTE_CHASE_STATES,
  quoteChaseDraft,
  quoteChaseTotalsByCurrency,
  quoteResponseLabel,
  sortQuoteChaseRows,
  stepLabel,
  WAIT_BUCKETS,
  type QuoteChaseRow,
  type QuoteChaseSortKey,
  type QuoteChaseTask,
  type QuoteChaseTotals,
} from '../lib/quoteChase'
import { addQuoteChaseNote, finishQuoteChaseTask, loadQuoteChaseData, saveQuoteChaseSettings, syncQuoteChaseTasks, type QuoteChaseData } from '../lib/quoteChaseStore'
import { pickTemplate, renderTemplate, type MessageTemplate } from '../lib/quoteNudges'
import { listTemplates } from '../lib/quoteNudgesStore'
import { listContacts, listTeam } from '../lib/accountsStore'
import { formatMoneyAmount } from '../lib/currency'
import { errorMessage } from '../lib/errors'
import { exportListCsv } from '../lib/listIo'
import { roleAtLeast } from '../lib/permissions'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import { isZohoMailEnabled } from '../lib/zoho'
import type { AccountContact, AppUser, CrmContact } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, minHeight: 32 }
const money = (n: number, cur: string) => formatMoneyAmount(n, cur)

const COLUMNS: { key: QuoteChaseSortKey; label: string; align?: 'right' }[] = [
  { key: 'client', label: 'Client' },
  { key: 'reference', label: 'Quote' },
  { key: 'days_since_sent', label: 'Days waiting', align: 'right' },
  { key: 'amount', label: 'Value', align: 'right' },
  { key: 'valid_until', label: 'Valid until' },
  { key: 'last_chase', label: 'Last follow-up' },
  { key: 'next_action', label: 'Next action' },
]

function asCrmContacts(list: AccountContact[]): CrmContact[] {
  return [...list]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.whatsapp || c.phone, role: c.is_primary ? 'Primary' : c.role }))
}

/**
 * Quote follow-up: every quote that went out and has no answer yet, how long
 * it has waited, every follow-up with the client's answer, and the task for
 * each step of the schedule. Quotes that need a decision (accepted, PO
 * received, expired in the last 7 days, declined) come first. Drafts only; a
 * person sends every message and presses every status button on the quote.
 */
export default function QuoteFollowUpPage() {
  const { userRole, user, tenantId } = useAuth()
  const { settings: appSettings } = useSettings()
  const { showToast } = useToast()
  const canWork = roleAtLeast(userRole, 'sales')
  const canSetSchedule = roleAtLeast(userRole, 'manager')
  const company = appSettings.companyName || 'Red Reach Middle East FZE'
  const ids = useId()
  const todayIso = isoDate(new Date())

  const [data, setData] = useState<QuoteChaseData | null>(null)
  const [error, setError] = useState('')
  const [team, setTeam] = useState<AppUser[]>([])
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [client, setClient] = useState('')
  const [division, setDivision] = useState('')
  const [bucket, setBucket] = useState('')
  const [state, setState] = useState('')
  const [sort, setSort] = useState<{ key: QuoteChaseSortKey; dir: 'asc' | 'desc' } | null>(null)
  const [logFor, setLogFor] = useState<QuoteChaseRow | null>(null)
  const [emailFor, setEmailFor] = useState<{ row: QuoteChaseRow; task: QuoteChaseTask } | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      let d = await loadQuoteChaseData()
      if (canWork && !d.setupMissing) {
        const added = await syncQuoteChaseTasks(d).catch(() => 0)
        if (added) d = await loadQuoteChaseData()
      }
      setData(d)
      setError('')
    } catch (e) {
      setError(errorMessage(e, 'Could not load quotes waiting for an answer'))
    }
  }, [canWork])

  useEffect(() => {
    void load()
    void listTeam().then(setTeam)
    void listContacts().then(setContacts).catch(() => setContacts([]))
    void listTemplates()
      .then((r) => setTemplates(r.rows))
      .catch(() => setTemplates([]))
  }, [load])

  const rows = useMemo(() => data?.rows ?? [], [data])
  const byQuote = useMemo(() => new Map(rows.map((r) => [r.quote_id, r])), [rows])
  const clients = useMemo(() => [...new Set(rows.map((r) => r.client))].sort((a, b) => a.localeCompare(b)), [rows])
  const divisions = useMemo(() => [...new Set(rows.map((r) => r.division).filter(Boolean))].sort(), [rows])
  const shown = useMemo(() => {
    const list = filterQuoteChaseRows(rows, { client, division, bucket, state }, todayIso)
    return sort ? sortQuoteChaseRows(list, sort.key, sort.dir) : list
  }, [rows, client, division, bucket, state, sort, todayIso])
  const totals = useMemo(() => quoteChaseTotalsByCurrency(shown), [shown])
  const nameOf = useMemo(() => new Map(team.map((u) => [u.id, u.name || u.email])), [team])
  const openTasks = useMemo(
    () =>
      (data?.tasks ?? [])
        .filter((t) => t.status === 'open' && byQuote.has(t.quotation_id))
        .sort((a, b) => a.due_on.localeCompare(b.due_on)),
    [data, byQuote],
  )
  const decide = rows.filter((r) => ['award', 'expired', 'close', 'callback_missed'].includes(r.next_action.kind))

  function contactsFor(row: QuoteChaseRow): CrmContact[] {
    return asCrmContacts(contacts.filter((c) => row.account_id && c.account_id === row.account_id))
  }

  function draftFor(row: QuoteChaseRow, task: QuoteChaseTask) {
    const name = contactsFor(row)[0]?.name || ''
    const built = quoteChaseDraft({
      kind: task.kind,
      stepDay: task.step_day,
      reference: row.reference,
      client: row.client,
      contactName: name,
      amount: row.amount,
      currency: row.currency,
      validUntil: row.valid_until,
      daysSinceSent: row.days_since_sent,
      companyName: company,
    })
    if (task.kind !== 'followup') return built
    // The team's own follow-up wording (Settings > Message templates) wins when there is one.
    const values = { name, account: row.client, quote_number: row.reference, amount: money(row.amount, row.currency), link: '', company }
    const email = pickTemplate(templates, { division: row.division, channel: 'email', purpose: 'quote_followup' })
    const wa = pickTemplate(templates, { division: row.division, channel: 'whatsapp', purpose: 'quote_followup' })
    const e = email.id ? renderTemplate(email, values) : { subject: built.subject, body: built.body }
    return { subject: e.subject, body: e.body, whatsapp: wa.id ? renderTemplate(wa, values).body : built.whatsapp }
  }

  async function finish(task: QuoteChaseTask, status: 'done' | 'skipped', outcome = '') {
    setBusy(task.id)
    try {
      await finishQuoteChaseTask(task.id, status, outcome)
      showToast(status === 'done' ? 'Task done.' : 'Task skipped.', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    } finally {
      setBusy('')
    }
  }

  /** A person pressed Send: log the follow-up and close the task. */
  async function afterSend(row: QuoteChaseRow, task: QuoteChaseTask) {
    try {
      await addQuoteChaseNote({
        quotation_id: row.quote_id,
        chased_on: isoDate(new Date()),
        channel: 'email',
        contact: contactsFor(row)[0]?.name || '',
        note: `${stepLabel(task, row.valid_until)} sent by email.`,
        response: '',
        next_follow_up: null,
      })
      await finishQuoteChaseTask(task.id, 'done', 'Sent by email')
      await load()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    }
  }

  function toggleSort(key: QuoteChaseSortKey) {
    setSort((s) =>
      s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'client' || key === 'reference' || key === 'valid_until' ? 'asc' : 'desc' },
    )
  }

  function exportCsv() {
    exportListCsv(
      'quote-follow-up',
      ['client', 'quote', 'status', 'division', 'currency', 'value', 'sent_on', 'days_waiting', 'valid_until', 'last_follow_up', 'answer', 'call_back', 'client_po', 'next_action'],
      shown.map((r) => ({
        client: r.client,
        quote: r.reference,
        status: r.status,
        division: r.division,
        currency: r.currency,
        value: r.amount,
        sent_on: r.sent_on,
        days_waiting: r.days_since_sent,
        valid_until: r.valid_until || '',
        last_follow_up: r.last_contact_on || '',
        answer: quoteResponseLabel(r.response),
        call_back: r.callback ? `${r.callback.date} (${r.callback.state})` : '',
        client_po: r.po?.po_number || '',
        next_action: r.next_action.text,
      })),
    )
  }

  const emailDraft = emailFor ? draftFor(emailFor.row, emailFor.task) : null

  return (
    <div>
      <PageHeader
        title="Quote follow-up"
        subtitle="Quotes that went out and have no answer yet, and who to follow up next. Nothing is sent automatically: you review every draft and press send."
        actions={
          <>
            <Link to="/quotations" style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}>
              Quotations
            </Link>
            <button type="button" style={buttonSecondaryStyle} onClick={exportCsv} disabled={!shown.length}>
              Export CSV
            </button>
          </>
        }
      />

      {error ? (
        <div role="alert" style={{ ...cardStyle, color: colors.danger, marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {data?.setupMissing ? (
        <div role="status" style={{ ...cardStyle, marginBottom: 16, fontSize: 13, color: colors.warn }}>
          The list works now. The follow-up log, tasks and schedule need the quote follow-up SQL (quote-chase.sql) to be run in Supabase.
        </div>
      ) : null}

      {/* Value waiting per currency, by how long */}
      <section aria-label="Value waiting by age" style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        {Object.keys(totals).length === 0 && data ? (
          <EmptyState title="Nothing waiting" subtitle="No sent quotes are waiting for an answer with these filters." />
        ) : null}
        {(Object.entries(totals) as [string, QuoteChaseTotals][]).map(([cur, t]) => (
          <div key={cur} style={{ ...cardStyle }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <strong>{cur}</strong>
              <span style={{ fontSize: 13, color: colors.muted }}>
                Waiting {money(t.total, cur)} · {t.count} quote{t.count === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 8 }}>
              {WAIT_BUCKETS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={bucket === b.key}
                  onClick={() => setBucket((x) => (x === b.key ? '' : b.key))}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${bucket === b.key ? colors.accent : colors.border}`,
                    background: 'transparent',
                    color: colors.text,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, color: colors.muted }}>{b.label}</div>
                  <div style={{ fontWeight: 650 }}>{money(t[b.key], cur)}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {decide.length ? (
        <section aria-label="Needs a decision" style={{ ...cardStyle, marginBottom: 20, borderColor: colors.warn }}>
          <h2 style={sectionTitleStyle}>Needs you now ({decide.length})</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {decide.map((r) => (
              <li key={r.quote_id}>
                <Link to={`/quotations?ref=${encodeURIComponent(r.reference)}`} style={{ color: colors.accentText }}>
                  {r.reference}
                </Link>{' '}
                {r.client} ({money(r.amount, r.currency)}): {r.next_action.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Follow-up tasks */}
      {!data?.setupMissing ? (
        <section aria-label="Follow-up tasks" style={{ ...cardStyle, marginBottom: 20 }}>
          <h2 style={sectionTitleStyle}>Follow-up tasks ({openTasks.length})</h2>
          {openTasks.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No follow-up tasks open. New ones appear when a sent quote reaches the next step of the schedule.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {openTasks.map((task) => {
                const row = byQuote.get(task.quotation_id)!
                const draft = draftFor(row, task)
                const phone = contactsFor(row).find((c) => c.phone)?.phone || ''
                return (
                  <li key={task.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13 }}>
                      <strong style={{ color: task.kind === 'escalate' ? colors.danger : colors.text }}>{stepLabel(task, row.valid_until)}</strong>
                      <span>
                        {row.reference} · {row.client} · {money(row.amount, row.currency)} · sent {row.days_since_sent} days ago
                      </span>
                      <span style={{ color: colors.muted }}>
                        due {task.due_on}
                        {task.assigned_to ? ` · ${nameOf.get(task.assigned_to) || 'assigned'}` : task.kind === 'escalate' ? ' · owner' : ''}
                      </span>
                    </div>
                    {canWork ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <button type="button" style={smallBtn} onClick={() => setEmailFor({ row, task })}>
                          <Mail size={13} aria-hidden /> Email draft
                        </button>
                        <a style={{ ...smallBtn, textDecoration: 'none' }} href={buildWhatsAppUrl(phone, draft.whatsapp)} target="_blank" rel="noreferrer">
                          <MessageCircle size={13} aria-hidden /> WhatsApp draft
                        </a>
                        <button type="button" style={smallBtn} onClick={() => setLogFor(row)}>
                          Log a call or visit
                        </button>
                        <button type="button" style={smallBtn} disabled={busy === task.id} onClick={() => void finish(task, 'done')}>
                          <CheckCircle2 size={13} aria-hidden /> Done
                        </button>
                        <button type="button" style={smallBtn} disabled={busy === task.id} onClick={() => void finish(task, 'skipped')}>
                          <SkipForward size={13} aria-hidden /> Skip
                        </button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {/* Filters */}
      <section aria-label="Filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ minWidth: 200, flex: '1 1 200px' }}>
          <label htmlFor={`${ids}-client`} style={labelStyle}>
            Client
          </label>
          <select id={`${ids}-client`} style={inputStyle} value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 160, flex: '1 1 160px' }}>
          <label htmlFor={`${ids}-division`} style={labelStyle}>
            Division
          </label>
          <select id={`${ids}-division`} style={inputStyle} value={division} onChange={(e) => setDivision(e.target.value)}>
            <option value="">All divisions</option>
            {divisions.map((d) => (
              <option key={d} value={d}>
                {divisionLabel(d)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 160, flex: '1 1 160px' }}>
          <label htmlFor={`${ids}-bucket`} style={labelStyle}>
            Waiting
          </label>
          <select id={`${ids}-bucket`} style={inputStyle} value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="">Any time</option>
            {WAIT_BUCKETS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 200, flex: '1 1 200px' }}>
          <label htmlFor={`${ids}-state`} style={labelStyle}>
            Show
          </label>
          <select id={`${ids}-state`} style={inputStyle} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Every quote waiting</option>
            {QUOTE_CHASE_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Table */}
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <caption style={{ position: 'absolute', left: -9999 }}>Sent quotes waiting for an answer</caption>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={{ ...thStyle, textAlign: c.align || 'left' }}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }} onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sort?.key === c.key ? sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden /> : null}
                  </button>
                </th>
              ))}
              <th scope="col" style={thStyle}>
                <span style={{ position: 'absolute', left: -9999 }}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <FollowUpRow key={r.quote_id} row={r} onLog={() => setLogFor(r)} />
            ))}
          </tbody>
        </table>
      </div>

      {data ? <ScheduleCard data={data} team={team} canEdit={canSetSchedule} tenantId={tenantId} userEmail={user?.email || ''} onSaved={load} /> : null}

      <Modal open={Boolean(logFor)} title={logFor ? `Follow-up log: ${logFor.reference} (${logFor.client})` : 'Follow-up log'} onClose={() => setLogFor(null)} width={720}>
        {logFor ? (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
              {money(logFor.amount, logFor.currency)} · sent {logFor.sent_on} ({logFor.days_since_sent} days) · valid until {logFor.valid_until || 'not set'} · next:{' '}
              {logFor.next_action.text}
            </p>
            <QuoteChasePanel quotationId={logFor.quote_id} reference={logFor.reference} onAdded={() => void load()} />
          </>
        ) : null}
      </Modal>

      <EmailComposeModal
        open={Boolean(emailFor)}
        companyName={emailFor?.row.client || ''}
        contacts={emailFor ? contactsFor(emailFor.row) : []}
        defaultSubject={emailDraft?.subject}
        defaultBody={emailDraft?.body}
        zohoEnabled={isZohoMailEnabled(appSettings)}
        onClose={() => setEmailFor(null)}
        onSent={async () => {
          if (emailFor) await afterSend(emailFor.row, emailFor.task)
        }}
        linkTo={emailFor ? { targetType: 'quotation', targetId: emailFor.row.quote_id } : undefined}
      />
    </div>
  )
}

function FollowUpRow({ row: r, onLog }: { row: QuoteChaseRow; onLog: () => void }) {
  const expiry =
    r.validity === 'expired'
      ? { text: 'Expired', color: colors.danger }
      : r.validity === 'expiring'
        ? { text: `${r.days_to_expiry} day${r.days_to_expiry === 1 ? '' : 's'} left`, color: colors.warn }
        : null
  return (
    <tr>
      <td style={tdStyle}>{r.client}</td>
      <td style={tdStyle}>
        <Link to={`/quotations?ref=${encodeURIComponent(r.reference)}`} style={{ color: colors.accentText }}>
          {r.reference}
        </Link>
        <div style={{ fontSize: 12, color: colors.muted2 }}>
          {r.status}
          {r.division ? ` · ${divisionLabel(r.division)}` : ''}
          {r.po ? ` · PO ${r.po.po_number}` : ''}
        </div>
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', color: r.days_since_sent > 21 ? colors.danger : r.days_since_sent > 7 ? colors.warn : colors.text }}>
        {r.days_since_sent}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.amount, r.currency)}</td>
      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
        {r.valid_until || '—'}
        {expiry ? <div style={{ fontSize: 12, fontWeight: 600, color: expiry.color }}>{expiry.text}</div> : null}
      </td>
      <td style={{ ...tdStyle, fontSize: 13 }}>
        {r.last_contact_on ? r.last_contact_on : <span style={{ color: colors.muted }}>Never</span>}
        {r.response ? <div style={{ fontSize: 12 }}>{quoteResponseLabel(r.response)}</div> : null}
        {r.callback ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: r.callback.state === 'missed' ? colors.danger : colors.warn }}>
            {r.callback.state === 'missed' ? `Missed call-back (${r.callback.date})` : `Call back ${r.callback.date}`}
          </div>
        ) : null}
      </td>
      <td style={{ ...tdStyle, fontSize: 13, minWidth: 200 }}>{r.next_action.text}</td>
      <td style={tdStyle}>
        <button type="button" style={smallBtn} onClick={onLog} aria-label={`Follow-up log for ${r.reference}`}>
          Follow-ups
        </button>
      </td>
    </tr>
  )
}

function ScheduleCard(props: {
  data: QuoteChaseData
  team: AppUser[]
  canEdit: boolean
  tenantId: string | null
  userEmail: string
  onSaved: () => Promise<void> | void
}) {
  const { showToast } = useToast()
  const ids = useId()
  const s = props.data.settings
  const [days, setDays] = useState(s.followupDays.join(', '))
  const [warn, setWarn] = useState(String(s.expiryWarnDays))
  const [escalate, setEscalate] = useState(String(s.escalateDays))
  const [owner, setOwner] = useState(s.escalateToUserId || '')
  const [saving, setSaving] = useState(false)
  const managers = props.team.filter((u) => u.role === 'admin' || u.role === 'manager')

  useEffect(() => {
    setDays(s.followupDays.join(', '))
    setWarn(String(s.expiryWarnDays))
    setEscalate(String(s.escalateDays))
    setOwner(s.escalateToUserId || '')
  }, [s.followupDays, s.expiryWarnDays, s.escalateDays, s.escalateToUserId])

  async function save() {
    const parsed = parseFollowupDays(days)
    if ('error' in parsed) {
      showToast(parsed.error, 'error')
      return
    }
    const esc = Number(escalate)
    if (!Number.isInteger(esc) || esc < 1 || esc > 180) {
      showToast('Escalation day must be between 1 and 180.', 'error')
      return
    }
    const w = Number(warn)
    if (!Number.isInteger(w) || w < 0 || w > 60) {
      showToast('Days before expiry must be between 0 and 60 (0 = no reminder).', 'error')
      return
    }
    if (!props.tenantId) {
      showToast('No workspace found for your account.', 'error')
      return
    }
    setSaving(true)
    try {
      await saveQuoteChaseSettings({ followupDays: parsed.days, expiryWarnDays: w, escalateDays: esc, escalateToUserId: owner || null }, props.tenantId, props.userEmail)
      showToast('Follow-up schedule saved.', 'success')
      await props.onSaved()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const ownerName = managers.find((u) => u.id === s.escalateToUserId)?.name
  return (
    <section aria-label="Follow-up schedule" style={{ ...cardStyle, marginTop: 20 }}>
      <h2 style={sectionTitleStyle}>Follow-up schedule</h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
        Follow up {s.followupDays.join(', ')} days after a quote is sent
        {s.expiryWarnDays ? `, remind the client ${s.expiryWarnDays} days before it expires` : ''}, then escalate to {ownerName || 'the owner'} at{' '}
        {s.escalateDays} days. Each step makes a task with a draft; nothing goes to a client until someone presses send. A follow-up logged in the two
        days before a step counts as that step.
      </p>
      {props.canEdit && !props.data.setupMissing ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor={`${ids}-days`} style={labelStyle}>
              Follow up after (days)
            </label>
            <input id={`${ids}-days`} style={inputStyle} value={days} onChange={(e) => setDays(e.target.value)} placeholder="3, 7, 14" />
          </div>
          <div style={{ flex: '0 1 160px' }}>
            <label htmlFor={`${ids}-warn`} style={labelStyle}>
              Days before expiry
            </label>
            <input id={`${ids}-warn`} type="number" min={0} max={60} style={inputStyle} value={warn} onChange={(e) => setWarn(e.target.value)} />
          </div>
          <div style={{ flex: '0 1 140px' }}>
            <label htmlFor={`${ids}-esc`} style={labelStyle}>
              Escalate at day
            </label>
            <input id={`${ids}-esc`} type="number" min={1} max={180} style={inputStyle} value={escalate} onChange={(e) => setEscalate(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor={`${ids}-owner`} style={labelStyle}>
              Escalate to
            </label>
            <select id={`${ids}-owner`} style={inputStyle} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Owner (any admin)</option>
              {managers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
