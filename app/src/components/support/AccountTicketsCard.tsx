import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import SlaBadge from './SlaBadge'
import TicketFormModal, { type TicketFormValues } from './TicketFormModal'
import { useSupportConfig } from './useSupportConfig'
import {
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  isOpenTicket,
  optionLabel,
  sortQueue,
} from '../../lib/support'
import { createTicket, listTickets, slaPackageFor } from '../../lib/supportStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import type { Account, AccountContact, AppUser, Ticket, TicketChannel, TicketPriority } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const EXPORT_COLUMNS = [
  'subject',
  'status',
  'priority',
  'channel',
  'requester_email',
  'sla_hours',
  'sla_due_at',
  'first_response_at',
  'resolved_at',
  'created_at',
] as const

const PRIORITY_VALUES = new Set(TICKET_PRIORITIES.map((p) => p.value))
const CHANNEL_VALUES = new Set(TICKET_CHANNELS.map((c) => c.value))

type Props = {
  account: Account
  contacts: AccountContact[]
  team: AppUser[]
  editable: boolean
  author: { appUserId: string | null; email: string }
}

/** Support tickets for one account, with a quick way to open a new one. */
export default function AccountTicketsCard({ account, contacts, team, editable, author }: Props) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { calendar, policies } = useSupportConfig()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setTickets(await listTickets(account.id))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load tickets'), 'error')
    }
  }, [account.id, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const isCtrm = account.type === 'ctrm_prospect'
  const defaultChannel: TicketChannel = isCtrm ? 'ctrm_next' : 'email'

  async function handleCreate(values: TicketFormValues) {
    if (!values.subject) {
      showToast('Add a subject so the team knows what it is about', 'error')
      return
    }
    setSaving(true)
    try {
      const packageId = await slaPackageFor(account.id, account.type)
      const id = await createTicket({ ...values, accountId: account.id, accountType: account.type, packageId }, policies, calendar, author)
      setOpen(false)
      navigate(`/support/${id}`)
    } catch (e) {
      showToast(errorMessage(e, 'Could not open the ticket'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importTicketsCsv(file: File) {
    if (!editable) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      const packageId = await slaPackageFor(account.id, account.type)
      let saved = 0
      let skipped = 0
      for (const row of objects) {
        const subject = String(row.subject || '').trim()
        if (!subject) {
          skipped += 1
          continue
        }
        const priorityRaw = String(row.priority || '').trim() as TicketPriority
        const channelRaw = String(row.channel || '').trim() as TicketChannel
        const priority = (PRIORITY_VALUES.has(priorityRaw) ? priorityRaw : 'normal') as TicketPriority
        const channel = (CHANNEL_VALUES.has(channelRaw) ? channelRaw : defaultChannel) as TicketChannel
        await createTicket(
          {
            accountId: account.id,
            accountType: account.type,
            packageId,
            contactId: null,
            subject,
            details: '',
            channel,
            priority,
            assigneeUserId: author.appUserId,
          },
          policies,
          calendar,
          author,
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

  const openCount = tickets.filter(isOpenTicket).length
  const shown = sortQueue(showAll ? tickets : tickets.filter(isOpenTicket)).slice(0, showAll ? 50 : 8)

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>
          {isCtrm ? 'Client issues' : 'Support tickets'} {openCount ? <span style={{ color: colors.muted, fontWeight: 400 }}>({openCount} open)</span> : null}
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
          {editable ? (
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          {tickets.length ? (
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
              onClick={() => {
                exportListCsv(
                  `account-tickets-${account.id.slice(0, 8)}.csv`,
                  [...EXPORT_COLUMNS],
                  tickets.map((t) => ({
                    subject: t.subject || '',
                    status: t.status,
                    priority: t.priority,
                    channel: t.channel,
                    requester_email: t.requester_email || '',
                    sla_hours: t.sla_hours,
                    sla_due_at: t.sla_due_at || '',
                    first_response_at: t.first_response_at || '',
                    resolved_at: t.resolved_at || '',
                    created_at: t.created_at || '',
                  })),
                )
                showToast('Tickets CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
          ) : null}
          {editable ? (
            <button type="button" style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }} onClick={() => setOpen(true)}>
              <Plus size={14} /> {isCtrm ? 'Log an issue' : 'New ticket'}
            </button>
          ) : null}
        </div>
      </div>
      {shown.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '10px 0 0' }}>
          {tickets.length
            ? 'No open tickets.'
            : isCtrm
              ? 'No issues yet. Log one when the client reports a problem with CTRM Next so updates to them are tracked.'
              : 'No tickets yet. Open one when they ask for help so the reply time is tracked.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 8 }}>
          {shown.map((t) => (
            <li
              key={t.id}
              onClick={() => navigate(`/support/${t.id}`)}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{t.subject || '(no subject)'}</div>
                <div style={{ fontSize: 11, color: colors.muted2 }}>{optionLabel(TICKET_STATUSES, t.status)}</div>
              </div>
              <SlaBadge ticket={t} />
            </li>
          ))}
        </ul>
      )}
      {tickets.length > openCount ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          style={{ background: 'none', border: 0, color: colors.muted, fontSize: 12, marginTop: 10, cursor: 'pointer', padding: 0 }}
        >
          {showAll ? 'Show open only' : `Show all ${tickets.length}`}
        </button>
      ) : null}
      <TicketFormModal
        open={open}
        onClose={() => setOpen(false)}
        accounts={[account]}
        contacts={contacts}
        team={team}
        lockedAccountId={account.id}
        defaultAssigneeId={author.appUserId}
        defaultChannel={defaultChannel}
        saving={saving}
        onSave={(v) => void handleCreate(v)}
      />
    </section>
  )
}
