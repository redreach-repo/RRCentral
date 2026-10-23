import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, LifeBuoy, Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SlaBadge from '../components/support/SlaBadge'
import { accountTypeLabel, canEditAccount } from '../lib/accounts'
import { listAccounts, listContacts, listTeam } from '../lib/accountsStore'
import { TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES, optionLabel } from '../lib/support'
import { LOGGED_FOR_CLIENT, addTicketMessage, getTicket, listMessages, updateTicket } from '../lib/supportStore'
import { errorMessage } from '../lib/errors'
import type { Account, AccountContact, AppUser, Ticket, TicketMessage, TicketPriority, TicketStatus } from '../lib/types'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  pageTitleStyle,
  sectionTitleStyle,
  selectStyle,
} from '../lib/uiStyles'

export default function TicketPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user, userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)

  const author = useMemo(() => ({ appUserId, email: user?.email || '' }), [appUserId, user?.email])

  const load = useCallback(async () => {
    try {
      const [t, m, { rows }, people, allContacts] = await Promise.all([
        getTicket(id),
        listMessages(id),
        listAccounts(),
        listTeam(),
        listContacts(),
      ])
      setTicket(t)
      setMessages(m)
      setAccounts(rows)
      setTeam(people)
      setContacts(allContacts)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the ticket'), 'error')
    } finally {
      setLoading(false)
    }
  }, [id, showToast])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <div style={pageStyle}>Loading ticket…</div>

  const account = ticket?.account_id ? accounts.find((a) => a.id === ticket.account_id) : undefined
  // Local mode has no RLS, so apply the same staff rule here.
  const hidden = ticket && userRole === 'staff' && (!account || account.owner_user_id !== appUserId)
  if (!ticket || hidden) {
    return (
      <div style={pageStyle}>
        <EmptyState
          icon={<LifeBuoy size={22} />}
          title="Ticket not found"
          subtitle="It may have been deleted, or it is on an account that is not assigned to you."
        />
        <p style={{ textAlign: 'center' }}>
          <Link to="/support">Back to support</Link>
        </p>
      </div>
    )
  }

  const editable = account
    ? canEditAccount(account, userRole, appUserId)
    : userRole === 'admin' || userRole === 'manager' || userRole === 'sales'
  const contact = ticket.contact_id ? contacts.find((c) => c.id === ticket.contact_id) : undefined
  const accountContacts = contacts.filter((c) => c.account_id === ticket.account_id)

  async function change(patch: Partial<Pick<Ticket, 'status' | 'priority' | 'assignee_user_id' | 'account_id' | 'contact_id'>>) {
    if (!ticket) return
    setBusy(true)
    try {
      await updateTicket(ticket, patch, author)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not update the ticket'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (!ticket || !reply.trim()) return
    setBusy(true)
    try {
      await addTicketMessage(ticket, reply.trim(), internal, author)
      setReply('')
      showToast(internal ? 'Note added' : 'Reply logged', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the reply'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const fileOptions = accounts
    .filter((a) => canEditAccount(a, userRole, appUserId))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div style={pageStyle}>
      <Link to="/support" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: colors.muted, fontSize: 13 }}>
        <ArrowLeft size={14} /> Support
      </Link>

      <div style={{ ...cardStyle, margin: '12px 0 16px' }}>
        <div style={{ fontSize: 12, color: colors.muted2, marginBottom: 4 }}>
          {optionLabel(TICKET_CHANNELS, ticket.channel)}, opened{' '}
          {format(parseISO(ticket.created_at), 'd MMM yyyy, HH:mm')}
          {ticket.created_by ? ` by ${ticket.created_by}` : ''}
        </div>
        <h1 style={{ ...pageTitleStyle, marginBottom: 6 }}>{ticket.subject || '(no subject)'}</h1>
        <div style={{ color: colors.muted, fontSize: 14, marginBottom: 14 }}>
          {account ? (
            <>
              <Link to={`/accounts/${account.id}`} style={{ color: colors.text, fontWeight: 600 }}>
                {account.name}
              </Link>
              , {accountTypeLabel(account.type)}
              {contact ? `, asked by ${contact.name || contact.email}` : ''}
            </>
          ) : (
            <>Unknown sender {ticket.requester_email}. File it on an account to start tracking it properly.</>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <div>
            <div style={labelStyle}>First reply ({ticket.sla_hours} working hours)</div>
            <SlaBadge ticket={ticket} />
          </div>
          <div style={{ ...fieldStyle, minWidth: 160 }}>
            <label style={labelStyle} htmlFor="t-status">
              Status
            </label>
            <select
              id="t-status"
              style={selectStyle}
              value={ticket.status}
              disabled={!editable || busy}
              onChange={(e) => void change({ status: e.target.value as TicketStatus })}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...fieldStyle, minWidth: 130 }}>
            <label style={labelStyle} htmlFor="t-priority">
              Priority
            </label>
            <select
              id="t-priority"
              style={selectStyle}
              value={ticket.priority}
              disabled={!editable || busy}
              onChange={(e) => void change({ priority: e.target.value as TicketPriority })}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...fieldStyle, minWidth: 180 }}>
            <label style={labelStyle} htmlFor="t-assignee">
              Assigned to
            </label>
            <select
              id="t-assignee"
              style={selectStyle}
              value={ticket.assignee_user_id ?? ''}
              disabled={!editable || busy}
              onChange={(e) => void change({ assignee_user_id: e.target.value || null })}
            >
              <option value="">Nobody yet</option>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
          {account && accountContacts.length ? (
            <div style={{ ...fieldStyle, minWidth: 180 }}>
              <label style={labelStyle} htmlFor="t-contact">
                Who asked
              </label>
              <select
                id="t-contact"
                style={selectStyle}
                value={ticket.contact_id ?? ''}
                disabled={!editable || busy}
                onChange={(e) => void change({ contact_id: e.target.value || null })}
              >
                <option value="">Not sure</option>
                {accountContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.email}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!account && editable ? (
            <div style={{ ...fieldStyle, minWidth: 220 }}>
              <label style={labelStyle} htmlFor="t-file">
                File on account
              </label>
              <select
                id="t-file"
                style={selectStyle}
                value=""
                disabled={busy}
                onChange={(e) => e.target.value && void change({ account_id: e.target.value })}
              >
                <option value="">Choose an account</option>
                {fileOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({accountTypeLabel(a.type)})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>Conversation</h2>
        {messages.length === 0 ? (
          <p style={{ color: colors.muted, margin: 0 }}>Nothing written yet. Add the first reply below.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {messages.map((m) => (
              <div
                key={m.id}
                data-internal={m.is_internal_note ? 'true' : undefined}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${m.is_internal_note ? 'rgba(245,158,11,0.45)' : colors.border}`,
                  background: m.is_internal_note
                    ? 'rgba(245,158,11,0.08)'
                    : m.author_kind === 'contact' || m.author_label.endsWith(LOGGED_FOR_CLIENT)
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(232,93,4,0.08)',
                }}
              >
                <div style={{ fontSize: 12, color: colors.muted2, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {m.is_internal_note ? <Lock size={12} /> : null}
                  <span>
                    {m.is_internal_note
                      ? `Internal note, ${m.author_label}`
                      : m.author_kind === 'contact'
                        ? `From the client, ${m.author_label}`
                        : m.author_label.endsWith(LOGGED_FOR_CLIENT)
                          ? `From the client, logged by ${m.author_label.slice(0, -LOGGED_FOR_CLIENT.length)}`
                          : `Reply, ${m.author_label}`}
                    , {format(parseISO(m.created_at), 'd MMM, HH:mm')}
                  </span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{m.body}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editable ? (
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>{internal ? 'Internal note' : 'Reply to the client'}</h2>
          <textarea
            aria-label={internal ? 'Internal note' : 'Reply'}
            style={{ ...inputStyle, minHeight: 110, resize: 'vertical', marginBottom: 10 }}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={internal ? 'Only the team sees this.' : 'What you told them.'}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: colors.muted }}>
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              Internal note, the client does not see it
            </label>
            <button type="button" style={buttonPrimaryStyle} disabled={busy || !reply.trim()} onClick={() => void send()}>
              {internal ? 'Add note' : 'Log reply'}
            </button>
          </div>
          {!internal ? (
            <p style={{ color: colors.muted2, fontSize: 12, margin: '10px 0 0' }}>
              Replies are logged here and on the account timeline. Send the message itself by email or WhatsApp as usual.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
