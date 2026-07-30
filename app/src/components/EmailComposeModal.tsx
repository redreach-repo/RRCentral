import { useEffect, useMemo, useState } from 'react'
import { Mail } from 'lucide-react'
import type { CrmContact } from '../lib/types'
import { contactEmails, primaryContact } from '../lib/contacts'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { openMailto, sendZohoMail } from '../lib/zoho'
import Modal from './Modal'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  fieldStyle,
  inputStyle,
  labelStyle,
  colors,
} from '../lib/uiStyles'

type Props = {
  open: boolean
  companyName: string
  contacts: CrmContact[]
  defaultSubject?: string
  defaultBody?: string
  zohoEnabled: boolean
  onClose: () => void
}

export default function EmailComposeModal({
  open,
  companyName,
  contacts,
  defaultSubject = '',
  defaultBody = '',
  zohoEnabled,
  onClose,
}: Props) {
  const { settings } = useSettings()
  const { showToast } = useToast()
  const emails = useMemo(() => contactEmails(contacts), [contacts])
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    const p = primaryContact(contacts)
    setTo(p?.email || emails[0] || '')
    setSubject(defaultSubject || `Follow-up — ${companyName}`)
    setBody(
      defaultBody ||
        `Dear ${p?.name || 'team'},\n\nI hope you are well.\n\nBest regards,\n${settings.companyName || 'Red Reach Middle East FZE'}`,
    )
  }, [open, contacts, emails, defaultSubject, defaultBody, companyName, settings.companyName])

  async function handleSend() {
    if (!to.trim()) {
      showToast('Choose a recipient email', 'error')
      return
    }
    setSending(true)
    try {
      if (zohoEnabled) {
        await sendZohoMail(settings, {
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
        })
        showToast('Email sent via Zoho Mail', 'success')
        onClose()
      } else {
        openMailto(to.trim(), subject.trim(), body.trim())
        showToast('Opened mail client (Zoho Mail not enabled)', 'success')
        onClose()
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Send failed', 'error')
    } finally {
      setSending(false)
    }
  }

  function handleMailtoFallback() {
    if (!to.trim()) {
      showToast('Choose a recipient email', 'error')
      return
    }
    openMailto(to.trim(), subject.trim(), body.trim())
  }

  return (
    <Modal open={open} title={`Email — ${companyName}`} onClose={onClose} width={560}>
      <div style={fieldStyle}>
        <label style={labelStyle}>To</label>
        {emails.length > 0 ? (
          <select style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)}>
            {contacts
              .filter((c) => c.email)
              .map((c) => (
                <option key={`${c.id}-${c.email}`} value={c.email}>
                  {c.name ? `${c.name} <${c.email}>` : c.email}
                </option>
              ))}
            {!emails.includes(to) && to ? <option value={to}>{to}</option> : null}
          </select>
        ) : (
          <input
            style={inputStyle}
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@example.com"
          />
        )}
        {emails.length === 0 ? (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted2 }}>
            No contact emails on this company — enter an address manually.
          </p>
        ) : null}
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Subject</label>
        <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Message</label>
        <textarea
          style={{ ...inputStyle, minHeight: 140, resize: 'vertical' }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={sending}>
          Cancel
        </button>
        {zohoEnabled ? (
          <button type="button" style={buttonSecondaryStyle} onClick={handleMailtoFallback} disabled={sending}>
            Open mailto…
          </button>
        ) : null}
        <button type="button" style={buttonPrimaryStyle} onClick={() => void handleSend()} disabled={sending}>
          <Mail size={14} />
          {sending ? 'Sending…' : zohoEnabled ? 'Send via Zoho' : 'Open mail app'}
        </button>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: colors.muted2 }}>
        {zohoEnabled
          ? 'Sends through Zoho Mail using credentials in Settings.'
          : 'Zoho Mail is off — opens your default mail client instead. Enable Zoho in Settings to send in-app.'}
      </p>
    </Modal>
  )
}
