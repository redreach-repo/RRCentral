import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import SlaBadge from './SlaBadge'
import TicketFormModal, { type TicketFormValues } from './TicketFormModal'
import { useSupportConfig } from './useSupportConfig'
import { TICKET_STATUSES, isOpenTicket, optionLabel, sortQueue } from '../../lib/support'
import { createTicket, listTickets, slaPackageFor } from '../../lib/supportStore'
import { errorMessage } from '../../lib/errors'
import type { Account, AccountContact, AppUser, Ticket } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

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

  const openCount = tickets.filter(isOpenTicket).length
  const shown = sortQueue(showAll ? tickets : tickets.filter(isOpenTicket)).slice(0, showAll ? 50 : 8)

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>
          Support tickets {openCount ? <span style={{ color: colors.muted, fontWeight: 400 }}>({openCount} open)</span> : null}
        </h2>
        {editable ? (
          <button type="button" style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }} onClick={() => setOpen(true)}>
            <Plus size={14} /> New ticket
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '10px 0 0' }}>
          {tickets.length ? 'No open tickets.' : 'No tickets yet. Open one when they ask for help so the reply time is tracked.'}
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
        saving={saving}
        onSave={(v) => void handleCreate(v)}
      />
    </section>
  )
}
