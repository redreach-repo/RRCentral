import { useEffect, useRef, useState } from 'react'
import { NO_TRADE_DATA_NOTE } from '../../lib/ctrmIssues'
import Modal from '../Modal'
import { useToast } from '../../contexts/ToastContext'
import { accountTypeLabel } from '../../lib/accounts'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { parseTicketForm } from '../../lib/schemas/ticket'
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
  colors,
} from '../../lib/uiStyles'

const EXPORT_COLUMNS = ['field', 'value'] as const

const CHANNEL_VALUES = new Set(TICKET_CHANNELS.map((c) => c.value))
const PRIORITY_VALUES = new Set(TICKET_PRIORITIES.map((p) => p.value))
const CHANNEL_BY_LABEL = new Map(
  TICKET_CHANNELS.map((c) => [c.label.toLowerCase(), c.value] as const),
)
const PRIORITY_BY_LABEL = new Map(
  TICKET_PRIORITIES.map((p) => [p.label.toLowerCase(), p.value] as const),
)

function matchChannel(raw: string): TicketChannel | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (CHANNEL_VALUES.has(v as TicketChannel)) return v as TicketChannel
  return CHANNEL_BY_LABEL.get(v) ?? null
}

function matchPriority(raw: string): TicketPriority | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (PRIORITY_VALUES.has(v as TicketPriority)) return v as TicketPriority
  return PRIORITY_BY_LABEL.get(v) ?? null
}

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
  /** How it came in, when the form opens (CTRM Next accounts start on CTRM Next). */
  defaultChannel?: TicketChannel
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
  defaultChannel = 'email',
  saving,
  onSave,
}: Props) {
  const { showToast } = useToast()
  const [accountId, setAccountId] = useState(lockedAccountId ?? '')
  const [contactId, setContactId] = useState('')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [channel, setChannel] = useState<TicketChannel>(defaultChannel)
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [assignee, setAssignee] = useState(defaultAssigneeId ?? '')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setAccountId(lockedAccountId ?? '')
    setContactId('')
    setSubject('')
    setDetails('')
    setChannel(defaultChannel)
    setPriority('normal')
    setAssignee(defaultAssigneeId ?? '')
  }, [open, lockedAccountId, defaultAssigneeId, defaultChannel])

  const accountContacts = contacts.filter((c) => c.account_id === accountId)
  const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name))

  async function importTicketCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      if (!objects.length) {
        showToast('No ticket draft rows in CSV', 'error')
        return
      }

      let applied = 0
      let nextAccountId = accountId
      const headerSet = new Set(headers.map((h) => h.trim().toLowerCase()))
      const isWide =
        headerSet.has('account') ||
        headerSet.has('subject') ||
        headerSet.has('channel') ||
        headerSet.has('priority')

      const applyField = (fieldRaw: string, value: string) => {
        const field = fieldRaw.trim().toLowerCase()
        if (!field || field === 'source') return
        if (field === 'account' || field === 'account_name' || field === 'client') {
          if (lockedAccountId) return
          if (!value) {
            nextAccountId = ''
            setAccountId('')
            setContactId('')
            applied += 1
            return
          }
          const match = accounts.find(
            (a) => a.name.toLowerCase() === value.toLowerCase() || a.id === value,
          )
          if (match) {
            nextAccountId = match.id
            setAccountId(match.id)
            setContactId('')
            applied += 1
          }
        } else if (field === 'contact' || field === 'contact_name' || field === 'who_asked') {
          if (!value) {
            setContactId('')
            applied += 1
            return
          }
          const pool = contacts.filter((c) => c.account_id === nextAccountId)
          const match = pool.find(
            (c) =>
              c.id === value ||
              (c.name || '').toLowerCase() === value.toLowerCase() ||
              (c.email || '').toLowerCase() === value.toLowerCase(),
          )
          if (match) {
            setContactId(match.id)
            applied += 1
          }
        } else if (field === 'subject') {
          setSubject(value)
          applied += 1
        } else if (field === 'details' || field === 'what_they_said') {
          setDetails(value)
          applied += 1
        } else if (field === 'channel' || field === 'came_in_by') {
          const ch = matchChannel(value)
          if (ch) {
            setChannel(ch)
            applied += 1
          }
        } else if (field === 'priority') {
          const pr = matchPriority(value)
          if (pr) {
            setPriority(pr)
            applied += 1
          }
        } else if (field === 'assignee' || field === 'assign_to') {
          if (!value) {
            setAssignee('')
            applied += 1
            return
          }
          const match = team.find(
            (u) =>
              u.id === value ||
              (u.name || '').toLowerCase() === value.toLowerCase() ||
              (u.email || '').toLowerCase() === value.toLowerCase(),
          )
          if (match) {
            setAssignee(match.id)
            applied += 1
          }
        }
      }

      if (isWide && !headerSet.has('field') && !headerSet.has('key')) {
        const row = objects[0]
        for (const key of Object.keys(row)) {
          applyField(key, String(row[key] ?? '').trim())
        }
      } else {
        for (const row of objects) {
          const field = String(row.field || row.key || '').trim()
          const value = String(row.value ?? '').trim()
          if (!field) continue
          applyField(field, value)
        }
      }

      if (!applied) {
        showToast('No ticket draft fields to import in CSV', 'error')
        return
      }
      showToast(`Imported ${applied} ticket draft field(s)`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Ticket draft CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New ticket" width={620}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const parsed = parseTicketForm({
            accountId,
            contactId: contactId || null,
            subject,
            details,
            channel,
            priority,
            assigneeUserId: assignee || null,
          })
          if (!parsed.ok) {
            showToast(parsed.error, 'error')
            return
          }
          onSave(parsed.data)
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
          {channel === 'ctrm_next' ? <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 0' }}>{NO_TRADE_DATA_NOTE}</p> : null}
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
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importTicketCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => {
              const account = accounts.find((a) => a.id === accountId)
              const contact = accountContacts.find((c) => c.id === contactId)
              const assigneeUser = team.find((u) => u.id === assignee)
              exportListCsv(
                'ticket-form-draft.csv',
                [...EXPORT_COLUMNS],
                [
                  { field: 'account', value: account?.name || accountId },
                  { field: 'contact', value: contact?.name || contactId || '' },
                  { field: 'subject', value: subject },
                  { field: 'details', value: details },
                  { field: 'channel', value: channel },
                  { field: 'priority', value: priority },
                  { field: 'assignee', value: assigneeUser?.name || assigneeUser?.email || assignee || '' },
                ],
              )
              showToast('Ticket draft CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
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
