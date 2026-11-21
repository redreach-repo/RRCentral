import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LifeBuoy, Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { useCompactCrm } from '../hooks/useMediaQuery'
import resp from '../styles/crmResponsive.module.css'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import StatusPill from '../components/StatusPill'
import SlaBadge from '../components/support/SlaBadge'
import TicketFormModal, { type TicketFormValues } from '../components/support/TicketFormModal'
import { useSupportConfig } from '../components/support/useSupportConfig'
import { ACCOUNT_TYPES, accountTypeLabel, canEditAccount, visibleAccounts } from '../lib/accounts'
import { listAccounts, listContacts, listTeam } from '../lib/accountsStore'
import { slaState } from '../lib/sla'
import {
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  isOpenTicket,
  optionLabel,
  sortQueue,
} from '../lib/support'
import {
  createTicket,
  listTickets,
  restoreTicket,
  slaPackageFor,
  softDeleteTicket,
  type TicketRow,
} from '../lib/supportStore'
import { errorMessage } from '../lib/errors'
import { TICKETS_CSV_COLUMNS } from '../lib/ticketsCsv'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import type { Account, AccountContact, AppUser, TicketChannel, TicketPriority } from '../lib/types'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: colors.danger,
  high: colors.warn,
  normal: colors.muted,
  low: colors.muted2,
}

export default function SupportPage() {
  const { t } = useI18n()
  const { user, userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const compact = useCompactCrm()
  const [searchParams, setSearchParams] = useSearchParams()
  const { calendar, policies } = useSupportConfig()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const status = searchParams.get('status') || 'open'
  const type = searchParams.get('type') || 'all'
  const priority = searchParams.get('priority') || 'all'
  const assignee = searchParams.get('assignee') || 'all'
  const hasUrlFilters = Boolean(
    searchParams.get('status') ||
      searchParams.get('type') ||
      searchParams.get('priority') ||
      searchParams.get('assignee'),
  )
  const currentViewFilters = useMemo(
    () => ({ status, type, priority, assignee }),
    [status, type, priority, assignee],
  )
  const applyViewFilters = useCallback(
    (raw: Record<string, unknown>) => {
      const params = new URLSearchParams()
      const nextStatus = String(raw.status || 'open')
      const nextType = String(raw.type || 'all')
      const nextPriority = String(raw.priority || 'all')
      const nextAssignee = String(raw.assignee || 'all')
      if (nextStatus !== 'open') params.set('status', nextStatus)
      if (nextType !== 'all') params.set('type', nextType)
      if (nextPriority !== 'all') params.set('priority', nextPriority)
      if (nextAssignee !== 'all') params.set('assignee', nextAssignee)
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, { rows }, people, allContacts] = await Promise.all([
        listTickets(undefined, { includeDeleted: showArchived }),
        listAccounts(),
        listTeam(),
        listContacts(),
      ])
      setTickets(list)
      setAccounts(rows)
      setTeam(people)
      setContacts(allContacts)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load tickets'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, showArchived])

  useEffect(() => {
    void load()
  }, [load])

  // Keep the SLA states fresh while the queue is open.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const teamById = useMemo(() => new Map(team.map((u) => [u.id, u])), [team])
  const mineAccounts = useMemo(() => visibleAccounts(accounts, userRole, appUserId), [accounts, userRole, appUserId])
  const writableAccounts = useMemo(
    () => mineAccounts.filter((a) => canEditAccount(a, userRole, appUserId)),
    [mineAccounts, userRole, appUserId],
  )

  // RLS already limits staff in the cloud; this keeps local mode the same.
  const visible = useMemo(() => {
    if (userRole !== 'staff') return tickets
    const ids = new Set(mineAccounts.map((a) => a.id))
    return tickets.filter((t) => t.account_id && ids.has(t.account_id))
  }, [tickets, mineAccounts, userRole])

  const filtered = useMemo(() => {
    const list = visible.filter((t) => {
      if (status === 'open' && !isOpenTicket(t)) return false
      if (status !== 'open' && status !== 'all' && t.status !== status) return false
      const acc = t.account_id ? accountById.get(t.account_id) : undefined
      if (type === 'unfiled' && t.account_id) return false
      if (type !== 'all' && type !== 'unfiled' && acc?.type !== type) return false
      if (priority !== 'all' && t.priority !== priority) return false
      if (assignee === 'me' && t.assignee_user_id !== appUserId) return false
      if (assignee === 'none' && t.assignee_user_id) return false
      if (!['all', 'me', 'none'].includes(assignee) && t.assignee_user_id !== assignee) return false
      return true
    })
    return sortQueue(list)
  }, [visible, status, type, priority, assignee, accountById, appUserId])

  const summary = useMemo(() => {
    const open = visible.filter(isOpenTicket)
    return {
      open: open.length,
      warning: open.filter((t) => slaState(t, now) === 'warning').length,
      breached: open.filter((t) => slaState(t, now) === 'breached').length,
      unfiled: open.filter((t) => !t.account_id).length,
    }
  }, [visible, now])

  function setFilter(key: string, value: string, fallback: string) {
    // Read the live URL so two quick filter changes do not undo each other.
    const params = new URLSearchParams(window.location.search)
    if (value === fallback) params.delete(key)
    else params.set(key, value)
    setSearchParams(params, { replace: true })
  }

  async function handleCreate(values: TicketFormValues) {
    const account = accountById.get(values.accountId)
    if (!account) {
      showToast('Choose the client or church this is for', 'error')
      return
    }
    if (!values.subject) {
      showToast('Add a subject so the team knows what it is about', 'error')
      return
    }
    setSaving(true)
    try {
      const packageId = await slaPackageFor(account.id, account.type)
      const id = await createTicket(
        { ...values, accountType: account.type, packageId },
        policies,
        calendar,
        { appUserId, email: user?.email || '' },
      )
      setModalOpen(false)
      navigate(`/support/${id}`)
    } catch (e) {
      showToast(errorMessage(e, 'Could not open the ticket'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importTicketsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, rows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of TICKETS_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, TICKETS_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid ticket rows', 'error')
        return
      }
      const byName = new Map(
        writableAccounts.map((a) => [a.name.trim().toLowerCase(), a] as const),
      )
      const priorityValues = new Set(TICKET_PRIORITIES.map((p) => p.value))
      const channelValues = new Set(TICKET_CHANNELS.map((c) => c.value))
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const account = byName.get(row.account.toLowerCase())
        if (!account) {
          skipped += 1
          continue
        }
        const ticketPriority = (
          priorityValues.has(row.priority as TicketPriority) ? row.priority : 'normal'
        ) as TicketPriority
        const channel = (
          channelValues.has(row.channel as TicketChannel) ? row.channel : 'email'
        ) as TicketChannel
        const packageId = await slaPackageFor(account.id, account.type)
        await createTicket(
          {
            accountId: account.id,
            accountType: account.type,
            packageId,
            contactId: null,
            subject: row.subject,
            details: row.details || '',
            channel,
            priority: ticketPriority,
            assigneeUserId: appUserId,
          },
          policies,
          calendar,
          { appUserId, email: user?.email || '' },
        )
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} ticket(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Ticket CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const canWrite = userRole !== 'viewer'
  const personName = (id: string | null) => {
    if (!id) return 'Nobody yet'
    const u = teamById.get(id)
    return u ? u.name || u.email : 'Former team member'
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.clients.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.support.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.support.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importTicketsCsv(file)
            }}
          />
          {canWrite ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
              disabled={importing || !writableAccounts.length}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!visible.length}
            onClick={() => {
              exportListCsv(
                'support-tickets.csv',
                [
                  'subject',
                  'status',
                  'priority',
                  'channel',
                  'account',
                  'assignee',
                  'sla_due_at',
                  'created_at',
                ],
                visible.map((row) => ({
                  subject: row.subject,
                  status: row.status,
                  priority: row.priority,
                  channel: row.channel,
                  account: row.account_id
                    ? accountById.get(row.account_id)?.name || row.account_id
                    : '',
                  assignee: row.assignee_user_id
                    ? teamById.get(row.assignee_user_id)?.name ||
                      teamById.get(row.assignee_user_id)?.email ||
                      row.assignee_user_id
                    : '',
                  sla_due_at: row.sla_due_at || '',
                  created_at: row.created_at || '',
                })),
              )
              showToast('Tickets CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          {canWrite ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              onClick={() => setModalOpen(true)}
              disabled={!writableAccounts.length}
            >
              <Plus size={16} /> {t('page.support.new')}
            </button>
          ) : null}
        </div>
      </header>

      <SavedViewsBar
        moduleId="support"
        filters={currentViewFilters}
        ownerUserId={appUserId}
        canWrite={canWrite}
        applyDefaultOnLoad={!hasUrlFilters}
        onApply={applyViewFilters}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.status || 'open') === String(b.status || 'open') &&
          String(a.type || 'all') === String(b.type || 'all') &&
          String(a.priority || 'all') === String(b.priority || 'all') &&
          String(a.assignee || 'all') === String(b.assignee || 'all')
        }
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Open', value: summary.open, color: colors.text, onClick: () => setFilter('status', 'open', 'open') },
          { label: 'Due soon', value: summary.warning, color: colors.warn },
          { label: 'Past SLA', value: summary.breached, color: colors.danger },
          ...(summary.unfiled
            ? [{ label: 'Unknown sender', value: summary.unfiled, color: colors.accentText, onClick: () => setFilter('type', 'unfiled', 'all') }]
            : []),
        ].map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            style={{
              ...cardStyle,
              padding: '10px 14px',
              minWidth: 110,
              textAlign: 'left',
              cursor: s.onClick ? 'pointer' : 'default',
              color: colors.text,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: colors.muted }}>{s.label}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <select
          aria-label="Status"
          style={{ ...selectStyle, maxWidth: 200 }}
          value={status}
          onChange={(e) => setFilter('status', e.target.value, 'open')}
        >
          <option value="open">Still open</option>
          <option value="all">Any status</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Account type"
          style={{ ...selectStyle, maxWidth: 220 }}
          value={type}
          onChange={(e) => setFilter('type', e.target.value, 'all')}
        >
          <option value="all">Clients and churches</option>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.plural}
            </option>
          ))}
          {userRole !== 'staff' ? <option value="unfiled">Unknown sender</option> : null}
        </select>
        <select
          aria-label="Priority"
          style={{ ...selectStyle, maxWidth: 170 }}
          value={priority}
          onChange={(e) => setFilter('priority', e.target.value, 'all')}
        >
          <option value="all">Any priority</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Assignee"
          style={{ ...selectStyle, maxWidth: 200 }}
          value={assignee}
          onChange={(e) => setFilter('assignee', e.target.value, 'all')}
        >
          <option value="all">Anyone</option>
          <option value="me">Me</option>
          <option value="none">Nobody yet</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading tickets…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy size={22} />}
          title={visible.length === 0 ? 'No tickets yet' : 'Nothing in this view'}
          subtitle={
            visible.length === 0
              ? 'When a client or church asks for help, open a ticket here so the reply time is tracked.'
              : status === 'open'
                ? 'Every ticket here is answered. Pick "Any status" to see older ones.'
                : 'Try another status, type, priority or person.'
          }
          actionLabel={canWrite && visible.length === 0 && writableAccounts.length ? 'Open a ticket' : undefined}
          onAction={() => setModalOpen(true)}
        />
      ) : compact ? (
        <div className={resp.listStack}>
          {filtered.map((t) => {
            const acc = t.account_id ? accountById.get(t.account_id) : undefined
            return (
              <article key={t.id} className={resp.card} onClick={() => navigate(`/support/${t.id}`)} style={{ cursor: 'pointer' }}>
                <div className={resp.cardTop}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className={resp.cardTitle}>{t.subject || '(no subject)'}</div>
                    <div className={resp.cardMeta}>
                      {acc ? `${acc.name}, ${accountTypeLabel(acc.type)}` : `Unknown sender ${t.requester_phone ? `+${t.requester_phone} on WhatsApp` : t.requester_email}`}
                    </div>
                  </div>
                  <StatusPill status={optionLabel(TICKET_STATUSES, t.status)} />
                </div>
                <div style={{ display: 'flex' }}>
                  <SlaBadge ticket={t} now={now} />
                </div>
                <div className={resp.cardMeta}>
                  <span style={{ color: PRIORITY_COLORS[t.priority], fontWeight: t.priority === 'urgent' ? 700 : 400 }}>
                    {optionLabel(TICKET_PRIORITIES, t.priority)}
                  </span>
                  {', '}
                  {personName(t.assignee_user_id)}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Ticket</th>
                  <th style={thStyle}>First reply</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Priority</th>
                  <th style={thStyle}>Assigned to</th>
                  {canWrite ? <th style={thStyle}>Archive</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const acc = t.account_id ? accountById.get(t.account_id) : undefined
                  const archived = Boolean(t.deleted_at)
                  return (
                    <tr key={t.id} onClick={() => navigate(`/support/${t.id}`)} style={{ cursor: 'pointer' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>
                          {t.subject || '(no subject)'}
                          {archived ? (
                            <span style={{ marginLeft: 6, fontSize: 11, color: colors.muted }}>
                              (archived)
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 11, color: colors.muted2 }}>
                          {acc ? `${acc.name}, ${accountTypeLabel(acc.type)}` : `Unknown sender ${t.requester_phone ? `+${t.requester_phone} on WhatsApp` : t.requester_email}`}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <SlaBadge ticket={t} now={now} />
                      </td>
                      <td style={tdStyle}>
                        <StatusPill status={optionLabel(TICKET_STATUSES, t.status)} />
                      </td>
                      <td style={{ ...tdStyle, color: PRIORITY_COLORS[t.priority], fontWeight: t.priority === 'urgent' ? 700 : 400 }}>
                        {optionLabel(TICKET_PRIORITIES, t.priority)}
                      </td>
                      <td style={tdStyle}>{personName(t.assignee_user_id)}</td>
                      {canWrite ? (
                        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            style={buttonSecondaryStyle}
                            onClick={() => {
                              void (async () => {
                                try {
                                  if (archived) await restoreTicket(t.id)
                                  else await softDeleteTicket(t.id)
                                  showToast(archived ? 'Ticket restored' : 'Ticket archived', 'success')
                                  await load()
                                } catch (err) {
                                  showToast(errorMessage(err, 'Could not update ticket'), 'error')
                                }
                              })()
                            }}
                          >
                            {archived ? 'Restore' : 'Archive'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TicketFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        accounts={writableAccounts}
        contacts={contacts}
        team={team}
        defaultAssigneeId={appUserId}
        saving={saving}
        onSave={(v) => void handleCreate(v)}
      />
    </div>
  )
}
