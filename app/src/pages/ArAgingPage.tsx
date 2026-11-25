import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, CheckCircle2, Mail, MessageCircle, SkipForward } from 'lucide-react'
import EmailComposeModal from '../components/EmailComposeModal'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import InvoiceChasePanel from '../components/invoices/InvoiceChasePanel'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import {
  AGING_BUCKETS,
  agingTotalsByCurrency,
  chaseDraft,
  divisionLabel,
  filterAgingRows,
  groupAgingByClient,
  parseReminderDays,
  sortAgingRows,
  type AgingRow,
  type AgingSortKey,
  type AgingTotals,
  type ChaseTask,
} from '../lib/arChase'
import { addChaseNote, finishChaseTask, loadAgingData, saveChaseSettings, syncChaseTasks, type AgingData } from '../lib/arChaseStore'
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

const COLUMNS: { key: AgingSortKey; label: string; align?: 'right' }[] = [
  { key: 'client', label: 'Client' },
  { key: 'reference', label: 'Invoice' },
  { key: 'due_date', label: 'Due' },
  { key: 'days_overdue', label: 'Days overdue', align: 'right' },
  { key: 'balance', label: 'Balance', align: 'right' },
  { key: 'last_chase', label: 'Last chase' },
  { key: 'next_action', label: 'Next action' },
]

function asCrmContacts(list: AccountContact[]): CrmContact[] {
  return [...list]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.whatsapp || c.phone, role: c.is_primary ? 'Primary' : c.role }))
}

/**
 * Accounts receivable aging and the chase workflow: what is owed by client
 * and age, every chase with its promised date, and the follow-up task for
 * each step of the schedule. Drafts only; a person sends every message.
 */
export default function ArAgingPage() {
  const { userRole, user, tenantId } = useAuth()
  const { settings: appSettings } = useSettings()
  const { showToast } = useToast()
  const canWork = roleAtLeast(userRole, 'sales')
  const canSetSchedule = roleAtLeast(userRole, 'manager')
  const company = appSettings.companyName || 'Red Reach Middle East FZE'
  const ids = useId()

  const [data, setData] = useState<AgingData | null>(null)
  const [error, setError] = useState('')
  const [team, setTeam] = useState<AppUser[]>([])
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [client, setClient] = useState('')
  const [division, setDivision] = useState('')
  const [bucket, setBucket] = useState('')
  const [groupBy, setGroupBy] = useState<'invoice' | 'client'>('client')
  const [sort, setSort] = useState<{ key: AgingSortKey; dir: 'asc' | 'desc' }>({ key: 'days_overdue', dir: 'desc' })
  const [chaseFor, setChaseFor] = useState<AgingRow | null>(null)
  const [emailFor, setEmailFor] = useState<{ row: AgingRow; task: ChaseTask } | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      let d = await loadAgingData()
      if (canWork && !d.setupMissing) {
        const added = await syncChaseTasks(d).catch(() => 0)
        if (added) d = await loadAgingData()
      }
      setData(d)
      setError('')
    } catch (e) {
      setError(errorMessage(e, 'Could not load receivables'))
    }
  }, [canWork])

  useEffect(() => {
    void load()
    void listTeam().then(setTeam)
    void listContacts().then(setContacts).catch(() => setContacts([]))
  }, [load])

  const rows = useMemo(() => data?.rows ?? [], [data])
  const byInvoice = useMemo(() => new Map(rows.map((r) => [r.invoice_id, r])), [rows])
  const clients = useMemo(() => [...new Set(rows.map((r) => r.client))].sort((a, b) => a.localeCompare(b)), [rows])
  const divisions = useMemo(() => [...new Set(rows.map((r) => r.division).filter(Boolean))].sort(), [rows])
  const shown = useMemo(
    () => sortAgingRows(filterAgingRows(rows, { client, division, bucket }), sort.key, sort.dir),
    [rows, client, division, bucket, sort],
  )
  const totals = useMemo(() => agingTotalsByCurrency(shown), [shown])
  const groups = useMemo(() => groupAgingByClient(shown), [shown])
  const nameOf = useMemo(() => new Map(team.map((u) => [u.id, u.name || u.email])), [team])
  const openTasks = useMemo(
    () =>
      (data?.tasks ?? [])
        .filter((t) => t.status === 'open' && byInvoice.has(t.invoice_id))
        .sort((a, b) => a.due_on.localeCompare(b.due_on)),
    [data, byInvoice],
  )
  const broken = rows.filter((r) => r.promise?.state === 'broken')

  function contactsFor(row: AgingRow): CrmContact[] {
    return asCrmContacts(contacts.filter((c) => row.account_id && c.account_id === row.account_id))
  }

  function draftFor(row: AgingRow, task: ChaseTask) {
    const people = contactsFor(row)
    return chaseDraft({
      kind: task.kind,
      stepDay: task.step_day,
      reference: row.reference,
      client: row.client,
      contactName: people[0]?.name || '',
      balance: row.balance,
      currency: row.currency,
      dueDate: row.due_date,
      daysOverdue: row.days_overdue,
      companyName: company,
      promise: row.promise,
    })
  }

  async function finish(task: ChaseTask, status: 'done' | 'skipped', outcome = '') {
    setBusy(task.id)
    try {
      await finishChaseTask(task.id, status, outcome)
      showToast(status === 'done' ? 'Task done.' : 'Task skipped.', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    } finally {
      setBusy('')
    }
  }

  /** A person pressed Send: log the chase and close the task. */
  async function afterSend(row: AgingRow, task: ChaseTask, channel: 'email') {
    try {
      await addChaseNote({
        invoice_id: row.invoice_id,
        chased_on: new Date().toISOString().slice(0, 10),
        channel,
        contact: contactsFor(row)[0]?.name || '',
        note: `${task.kind === 'escalate' ? 'Escalation' : `Day ${task.step_day} reminder`} sent by email.`,
        promised_date: null,
      })
      await finishChaseTask(task.id, 'done', 'Sent by email')
      await load()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    }
  }

  function toggleSort(key: AgingSortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'client' || key === 'reference' ? 'asc' : 'desc' }))
  }

  function exportCsv() {
    exportListCsv(
      'receivables-aging',
      ['client', 'invoice', 'division', 'currency', 'balance', 'due_date', 'days_overdue', 'bucket', 'last_chase', 'promised_date', 'promise', 'next_action'],
      shown.map((r) => ({
        client: r.client,
        invoice: r.reference,
        division: r.division,
        currency: r.currency,
        balance: r.balance,
        due_date: r.due_date || '',
        days_overdue: r.days_overdue,
        bucket: r.bucket,
        last_chase: r.last_chase?.chased_on || '',
        promised_date: r.promise?.date || '',
        promise: r.promise?.state || '',
        next_action: r.next_action.text,
      })),
    )
  }

  const emailDraft = emailFor ? draftFor(emailFor.row, emailFor.task) : null

  return (
    <div>
      <PageHeader
        title="Aging and chasing"
        subtitle="What clients owe, by age, and who to chase next. Nothing is sent automatically: you review every draft and press send."
        actions={
          <>
            <Link to="/invoices" style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}>
              Invoices
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
          Aging works now. The chase log, tasks and schedule need the overdue invoice chasing SQL (ar-chase.sql) to be run in Supabase.
        </div>
      ) : null}

      {/* Totals per currency, by bucket */}
      <section aria-label="Totals by age" style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        {Object.keys(totals).length === 0 && data ? (
          <EmptyState title="Nothing owed" subtitle="No unpaid invoices that have gone out match these filters." />
        ) : null}
        {(Object.entries(totals) as [string, AgingTotals][]).map(([cur, t]) => (
          <div key={cur} style={{ ...cardStyle }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <strong>{cur}</strong>
              <span style={{ fontSize: 13, color: colors.muted }}>
                Owing {money(t.total, cur)} · overdue <strong style={{ color: t.overdue ? colors.danger : colors.text }}>{money(t.overdue, cur)}</strong> ·{' '}
                {t.count} invoice{t.count === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 8 }}>
              {AGING_BUCKETS.map((b) => (
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

      {broken.length ? (
        <section aria-label="Broken promises" style={{ ...cardStyle, marginBottom: 20, borderColor: colors.danger }}>
          <h2 style={{ ...sectionTitleStyle, color: colors.danger }}>Broken promises ({broken.length})</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {broken.map((r) => (
              <li key={r.invoice_id}>
                <button type="button" style={{ all: 'unset', cursor: 'pointer', color: colors.accentText }} onClick={() => setChaseFor(r)}>
                  {r.reference}
                </button>{' '}
                {r.client}: {money(r.balance, r.currency)} promised by {r.promise?.date}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Chase tasks */}
      {!data?.setupMissing ? (
        <section aria-label="Chase tasks" style={{ ...cardStyle, marginBottom: 20 }}>
          <h2 style={sectionTitleStyle}>Chase tasks ({openTasks.length})</h2>
          {openTasks.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No chase tasks open. New ones appear when an invoice reaches the next step of the schedule.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {openTasks.map((task) => {
                const row = byInvoice.get(task.invoice_id)!
                const draft = draftFor(row, task)
                const phone = contactsFor(row).find((c) => c.phone)?.phone || ''
                return (
                  <li key={task.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13 }}>
                      <strong style={{ color: task.kind === 'escalate' ? colors.danger : colors.text }}>
                        {task.kind === 'escalate' ? `Escalate to owner (day ${task.step_day})` : `Day ${task.step_day} reminder`}
                      </strong>
                      <span>
                        {row.reference} · {row.client} · {money(row.balance, row.currency)} · {row.days_overdue} days overdue
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
                        <a
                          style={{ ...smallBtn, textDecoration: 'none' }}
                          href={buildWhatsAppUrl(phone, draft.whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle size={13} aria-hidden /> WhatsApp draft
                        </a>
                        <button type="button" style={smallBtn} onClick={() => setChaseFor(row)}>
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
            Age
          </label>
          <select id={`${ids}-bucket`} style={inputStyle} value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="">All ages</option>
            {AGING_BUCKETS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Group by" style={{ display: 'flex', gap: 6 }}>
          {(['client', 'invoice'] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={groupBy === g}
              style={{ ...smallBtn, minHeight: 40, borderColor: groupBy === g ? colors.accent : undefined }}
              onClick={() => setGroupBy(g)}
            >
              {g === 'client' ? 'By client' : 'All invoices'}
            </button>
          ))}
        </div>
      </section>

      {/* Table */}
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <caption style={{ position: 'absolute', left: -9999 }}>Unpaid invoices by age</caption>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={{ ...thStyle, textAlign: c.align || 'left' }}
                  aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }} onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sort.key === c.key ? sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden /> : null}
                  </button>
                </th>
              ))}
              <th scope="col" style={thStyle}>
                <span style={{ position: 'absolute', left: -9999 }}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {groupBy === 'client'
              ? groups.flatMap((g) => [
                  <tr key={`g-${g.client}`}>
                    <th scope="rowgroup" colSpan={COLUMNS.length + 1} style={{ ...tdStyle, fontWeight: 650, textAlign: 'left', background: 'var(--surface-2, transparent)' }}>
                      {g.client}{' '}
                      <span style={{ fontWeight: 400, color: colors.muted, fontSize: 13 }}>
                        · {Object.entries(g.totals).map(([cur, t]) => money(t.total, cur)).join(' + ')} · {g.rows.length} invoice{g.rows.length === 1 ? '' : 's'}
                      </span>
                    </th>
                  </tr>,
                  ...g.rows.map((r) => <AgingTableRow key={r.invoice_id} row={r} onChase={() => setChaseFor(r)} />),
                ])
              : shown.map((r) => <AgingTableRow key={r.invoice_id} row={r} onChase={() => setChaseFor(r)} />)}
          </tbody>
        </table>
      </div>

      {data ? <ChaseScheduleCard data={data} team={team} canEdit={canSetSchedule} tenantId={tenantId} userEmail={user?.email || ''} onSaved={load} /> : null}

      <Modal open={Boolean(chaseFor)} title={chaseFor ? `Chase log: ${chaseFor.reference} (${chaseFor.client})` : 'Chase log'} onClose={() => setChaseFor(null)} width={720}>
        {chaseFor ? (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
              {money(chaseFor.balance, chaseFor.currency)} owing · due {chaseFor.due_date || 'no due date'} · {chaseFor.days_overdue} days overdue · next:{' '}
              {chaseFor.next_action.text}
            </p>
            <InvoiceChasePanel invoiceId={chaseFor.invoice_id} reference={chaseFor.reference} balance={chaseFor.balance} onAdded={() => void load()} />
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
          if (emailFor) await afterSend(emailFor.row, emailFor.task, 'email')
        }}
        linkTo={emailFor ? { targetType: 'invoice', targetId: emailFor.row.invoice_id } : undefined}
      />
    </div>
  )
}

function AgingTableRow({ row: r, onChase }: { row: AgingRow; onChase: () => void }) {
  const late = r.days_overdue > 0
  return (
    <tr>
      <td style={tdStyle}>{r.client}</td>
      <td style={tdStyle}>
        {r.reference}
        {r.division ? <div style={{ fontSize: 12, color: colors.muted2 }}>{divisionLabel(r.division)}</div> : null}
      </td>
      <td style={tdStyle}>{r.due_date || '—'}</td>
      <td style={{ ...tdStyle, textAlign: 'right', color: r.days_overdue > 30 ? colors.danger : late ? colors.warn : colors.text }}>
        {late ? r.days_overdue : 'Not due'}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.balance, r.currency)}</td>
      <td style={{ ...tdStyle, fontSize: 13 }}>
        {r.last_chase ? `${r.last_chase.chased_on} · ${r.last_chase.channel}` : <span style={{ color: colors.muted }}>Never</span>}
        {r.promise ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: r.promise.state === 'broken' ? colors.danger : colors.warn }}>
            {r.promise.state === 'broken' ? `Broken promise (${r.promise.date})` : `Promised ${r.promise.date}`}
          </div>
        ) : null}
      </td>
      <td style={{ ...tdStyle, fontSize: 13, minWidth: 200 }}>{r.next_action.text}</td>
      <td style={tdStyle}>
        <button type="button" style={smallBtn} onClick={onChase} aria-label={`Chase log for ${r.reference}`}>
          Chase log
        </button>
      </td>
    </tr>
  )
}

function ChaseScheduleCard(props: {
  data: AgingData
  team: AppUser[]
  canEdit: boolean
  tenantId: string | null
  userEmail: string
  onSaved: () => Promise<void> | void
}) {
  const { showToast } = useToast()
  const ids = useId()
  const s = props.data.settings
  const [days, setDays] = useState(s.reminderDays.join(', '))
  const [escalate, setEscalate] = useState(String(s.escalateDays))
  const [owner, setOwner] = useState(s.escalateToUserId || '')
  const [saving, setSaving] = useState(false)
  const managers = props.team.filter((u) => u.role === 'admin' || u.role === 'manager')

  useEffect(() => {
    setDays(s.reminderDays.join(', '))
    setEscalate(String(s.escalateDays))
    setOwner(s.escalateToUserId || '')
  }, [s.reminderDays, s.escalateDays, s.escalateToUserId])

  async function save() {
    const parsed = parseReminderDays(days)
    if ('error' in parsed) {
      showToast(parsed.error, 'error')
      return
    }
    const esc = Number(escalate)
    if (!Number.isInteger(esc) || esc < 1 || esc > 365) {
      showToast('Escalation day must be between 1 and 365.', 'error')
      return
    }
    if (!props.tenantId) {
      showToast('No workspace found for your account.', 'error')
      return
    }
    setSaving(true)
    try {
      await saveChaseSettings({ reminderDays: parsed.days, escalateDays: esc, escalateToUserId: owner || null }, props.tenantId, props.userEmail)
      showToast('Chase schedule saved.', 'success')
      await props.onSaved()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const ownerName = managers.find((u) => u.id === s.escalateToUserId)?.name
  return (
    <section aria-label="Chase schedule" style={{ ...cardStyle, marginTop: 20 }}>
      <h2 style={sectionTitleStyle}>Chase schedule</h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
        Reminders at {s.reminderDays.join(', ')} days overdue, then escalate to {ownerName || 'the owner'} at {s.escalateDays} days. Each step
        makes a follow-up task with a draft; nothing goes to a client until someone presses send.
      </p>
      {props.canEdit && !props.data.setupMissing ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor={`${ids}-days`} style={labelStyle}>
              Reminder days overdue
            </label>
            <input id={`${ids}-days`} style={inputStyle} value={days} onChange={(e) => setDays(e.target.value)} placeholder="1, 7, 14, 30" />
          </div>
          <div style={{ flex: '0 1 140px' }}>
            <label htmlFor={`${ids}-esc`} style={labelStyle}>
              Escalate at day
            </label>
            <input id={`${ids}-esc`} type="number" min={1} max={365} style={inputStyle} value={escalate} onChange={(e) => setEscalate(e.target.value)} />
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
