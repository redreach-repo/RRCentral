import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { BellRing, Mail, MessageCircle, Pencil } from 'lucide-react'
import EmailComposeModal from '../EmailComposeModal'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { listContacts, logAccountEvent } from '../../lib/accountsStore'
import { reminderMessage } from '../../lib/contractBilling'
import { listDueReminders, recordReminder, sendReminder, type ReminderRow } from '../../lib/contractBillingStore'
import { errorMessage } from '../../lib/errors'
import { formatAED } from '../../lib/money'
import { reminderRecipient } from '../../lib/paymentReminder'
import { buildWhatsAppUrl } from '../../lib/whatsapp'
import { isZohoMailEnabled } from '../../lib/zoho'
import type { AccountContact, CrmContact, InvoiceReminder } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }

function asCrmContacts(list: AccountContact[]): CrmContact[] {
  return [...list]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.whatsapp || c.phone, role: c.is_primary ? 'Primary' : c.role }))
}

/**
 * Invoices 3, 7 or 14 days past their due date. One tap on Email or WhatsApp
 * sends the prepared reminder to the account's contact through the
 * payment-reminder function, which records it (each stage once per invoice)
 * and logs it on the account timeline. Nothing is ever sent automatically.
 * While a channel is not set up, the buttons fall back to the old way: the
 * email opens to edit, WhatsApp opens with the message ready.
 */
export default function PaymentRemindersCard() {
  const { user, appUserId } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [rows, setRows] = useState<ReminderRow[] | null>(null)
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [emailFor, setEmailFor] = useState<ReminderRow | null>(null)
  const [busy, setBusy] = useState('')
  const company = settings.companyName || 'Red Reach Middle East FZE'

  const load = useCallback(async () => {
    try {
      const [due, people] = await Promise.all([listDueReminders(), listContacts()])
      setRows(due)
      setContacts(people)
    } catch {
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const contactsFor = useCallback(
    (row: ReminderRow) => asCrmContacts(contacts.filter((c) => row.invoice.account_id && c.account_id === row.invoice.account_id)),
    [contacts],
  )

  function message(row: ReminderRow) {
    const people = contactsFor(row)
    return reminderMessage({
      stage: row.due.stage,
      contactName: people[0]?.name || '',
      reference: row.invoice.reference_number,
      balanceText: formatAED(row.balance),
      dueDate: row.due.dueDate,
      daysLate: row.due.daysLate,
      companyName: company,
    })
  }

  async function markSent(row: ReminderRow, channel: InvoiceReminder['channel']) {
    setBusy(row.invoice.id)
    try {
      await recordReminder(row.invoice.id, row.due.stage, channel, user?.email || '')
      // One tap sends log this themselves; the manual ways log it here.
      if (row.invoice.account_id) {
        const how = channel === 'email' ? 'by email' : channel === 'whatsapp' ? 'on WhatsApp' : 'another way'
        await logAccountEvent(
          row.invoice.account_id,
          `${row.due.stage} day payment reminder for ${row.invoice.reference_number} (${formatAED(row.balance)} owing) sent ${how} by ${user?.email || 'a team member'}`,
          { appUserId, email: user?.email || '' },
        )
      }
      showToast(`${row.due.stage} day reminder recorded for ${row.invoice.reference_number}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not record the reminder'), 'error')
    } finally {
      setBusy('')
    }
  }

  function openWhatsApp(row: ReminderRow) {
    const { body } = message(row)
    const phone = contactsFor(row)[0]?.phone || ''
    window.open(buildWhatsAppUrl(phone, body, settings.whatsappCountryCode || '971'), '_blank', 'noopener')
    void markSent(row, 'whatsapp')
  }

  const recipientFor = (row: ReminderRow, channel: 'email' | 'whatsapp') =>
    reminderRecipient(
      contacts.filter((c) => row.invoice.account_id && c.account_id === row.invoice.account_id),
      channel,
      null,
      settings.whatsappCountryCode || '971',
    )

  async function send(row: ReminderRow, channel: 'email' | 'whatsapp') {
    setBusy(row.invoice.id)
    try {
      const result = await sendReminder(row.invoice.id, channel)
      if (result.ok) {
        showToast(`${result.stage} day reminder for ${row.invoice.reference_number} sent to ${result.to}`, 'success')
        await load()
        return
      }
      // Not set up yet: the old way, so reminders still go out.
      if (result.code === 'not_deployed' || result.code === `${channel}_not_configured`) {
        if (channel === 'email') setEmailFor(row)
        else openWhatsApp(row)
        return
      }
      showToast(result.message, result.code === 'already_sent' || result.code === 'not_due' ? 'info' : 'error')
      if (result.code === 'already_sent' || result.code === 'not_due') await load()
    } finally {
      setBusy('')
    }
  }

  const emailDraft = emailFor ? message(emailFor) : null

  if (!rows || rows.length === 0) return null

  return (
    <section style={{ ...cardStyle, marginBottom: 16, borderColor: 'rgba(245,158,11,0.45)' }} aria-label="Payment reminders">
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <BellRing size={18} /> Payment reminders due ({rows.length})
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 8px' }}>
        Due at 3, 7 and 14 days after the due date. Email or WhatsApp sends the prepared message to the account's
        contact in one tap and records it, so each stage goes out once. Edit opens the email first.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row) => (
          <li
            key={row.invoice.id}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: 13,
            }}
          >
            <span style={{ minWidth: 0, flex: '1 1 220px' }}>
              {row.invoice.account_id ? (
                <Link to={`/accounts/${row.invoice.account_id}`} style={{ color: colors.text, fontWeight: 600 }}>
                  {row.invoice.client}
                </Link>
              ) : (
                <strong>{row.invoice.client}</strong>
              )}{' '}
              <span style={{ color: colors.muted }}>
                {row.invoice.reference_number}, {formatAED(row.balance)} owing, due{' '}
                {format(parseISO(row.due.dueDate), 'd MMM')},{' '}
              </span>
              <span style={{ color: row.due.stage === 14 ? colors.danger : colors.warn }}>
                {row.due.daysLate} days late ({row.due.stage} day reminder)
              </span>
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                style={smallBtn}
                disabled={busy === row.invoice.id || !recipientFor(row, 'email')}
                title={recipientFor(row, 'email') ? `Send now to ${recipientFor(row, 'email')!.to}` : 'No contact email on this account'}
                onClick={() => void send(row, 'email')}
              >
                <Mail size={12} /> {busy === row.invoice.id ? 'Sending…' : 'Email'}
              </button>
              <button
                type="button"
                style={smallBtn}
                disabled={busy === row.invoice.id || !recipientFor(row, 'whatsapp')}
                title={recipientFor(row, 'whatsapp') ? `Send now to +${recipientFor(row, 'whatsapp')!.to}` : 'No WhatsApp number on this account'}
                onClick={() => void send(row, 'whatsapp')}
              >
                <MessageCircle size={12} /> WhatsApp
              </button>
              <button type="button" style={smallBtn} disabled={busy === row.invoice.id} title="Edit the email before sending" onClick={() => setEmailFor(row)}>
                <Pencil size={12} /> Edit
              </button>
              <button type="button" style={smallBtn} disabled={busy === row.invoice.id} onClick={() => void markSent(row, 'other')}>
                Mark sent
              </button>
            </span>
          </li>
        ))}
      </ul>
      <EmailComposeModal
        open={Boolean(emailFor)}
        companyName={emailFor?.invoice.client || ''}
        contacts={emailFor ? contactsFor(emailFor) : []}
        defaultSubject={emailDraft?.subject}
        defaultBody={emailDraft?.body}
        zohoEnabled={isZohoMailEnabled(settings)}
        onClose={() => setEmailFor(null)}
        onSent={async () => {
          if (emailFor) await markSent(emailFor, 'email')
        }}
      />
    </section>
  )
}
