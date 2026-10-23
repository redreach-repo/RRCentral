import { useEffect, useState } from 'react'
import Modal from '../Modal'
import { accountTypeLabel } from '../../lib/accounts'
import { TICKET_CHANNELS, TICKET_PRIORITIES } from '../../lib/support'
import type { Account, AccountContact, AppUser, TicketChannel, TicketPriority } from '../../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../../lib/uiStyles'

export type TicketFormValues = {
  accountId: string
  contactId: string | null
  subject: string
  details: string
  channel: TicketChannel
  priority: TicketPriority
  assigneeUserId: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  accounts: Account[]
  contacts: AccountContact[]
  team: AppUser[]
  /** Fixes the account, e.g. when opened from an account page. */
  lockedAccountId?: string
  defaultAssigneeId: string | null
  saving: boolean
  onSave: (values: TicketFormValues) => void
}

export default function TicketFormModal({
  open,
  onClose,
  accounts,
  contacts,
  team,
  lockedAccountId,
  defaultAssigneeId,
  saving,
  onSave,
}: Props) {
  const [accountId, setAccountId] = useState(lockedAccountId ?? '')
  const [contactId, setContactId] = useState('')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [channel, setChannel] = useState<TicketChannel>('email')
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [assignee, setAssignee] = useState(defaultAssigneeId ?? '')

  useEffect(() => {
    if (!open) return
    setAccountId(lockedAccountId ?? '')
    setContactId('')
    setSubject('')
    setDetails('')
    setChannel('email')
    setPriority('normal')
    setAssignee(defaultAssigneeId ?? '')
  }, [open, lockedAccountId, defaultAssigneeId])

  const accountContacts = contacts.filter((c) => c.account_id === accountId)
  const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Modal open={open} onClose={onClose} title="New ticket" width={620}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            accountId,
            contactId: contactId || null,
            subject: subject.trim(),
            details,
            channel,
            priority,
            assigneeUserId: assignee || null,
          })
        }}
      >
        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="ticket-account">
              Client or church
            </label>
            <select
              id="ticket-account"
              style={selectStyle}
              value={accountId}
              disabled={Boolean(lockedAccountId)}
              onChange={(e) => {
                setAccountId(e.target.value)
                setContactId('')
              }}
            >
              <option value="">Choose an account</option>
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({accountTypeLabel(a.type)})
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="ticket-contact">
              Who asked
            </label>
            <select
              id="ticket-contact"
              style={selectStyle}
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={!accountContacts.length}
            >
              <option value="">{accountContacts.length ? 'Not sure' : 'No contacts on this account'}</option>
              {accountContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ ...fieldStyle, marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="ticket-subject">
            Subject
          </label>
          <input
            id="ticket-subject"
            style={inputStyle}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Bot stopped replying on WhatsApp"
          />
        </div>
        <div style={{ ...fieldStyle, marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="ticket-details">
            What they said
          </label>
          <textarea
            id="ticket-details"
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="ticket-channel">
              Came in by
            </label>
            <select
              id="ticket-channel"
              style={selectStyle}
              value={channel}
              onChange={(e) => setChannel(e.target.value as TicketChannel)}
            >
              {TICKET_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="ticket-priority">
              Priority
            </label>
            <select
              id="ticket-priority"
              style={selectStyle}
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="ticket-assignee">
              Assign to
            </label>
            <select
              id="ticket-assignee"
              style={selectStyle}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Nobody yet</option>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
            {saving ? 'Saving…' : 'Open ticket'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
