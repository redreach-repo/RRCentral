import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Mail, Paperclip } from 'lucide-react'
import type { CrmContact } from '../lib/types'
import { contactEmails, primaryContact } from '../lib/contacts'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { getMailProvider } from '../lib/mailCalendar'
import { openMailto } from '../lib/zoho'
import { downloadBlob } from '../lib/documents'
import { blobToBase64, getMailStatus, sendMail, type MailLinkTarget } from '../lib/mailInbox/mailInboxApi'
import { isSupabaseConfigured } from '../lib/supabaseConfig'
import Modal from './Modal'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  fieldStyle,
  inputStyle,
  labelStyle,
  colors,
} from '../lib/uiStyles'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { parseEmailComposeForm } from '../lib/schemas/emailCompose'

const EMAIL_COMPOSE_CSV_COLUMNS = [
  'kind',
  'name',
  'email',
  'company',
  'to',
  'subject',
  'body',
] as const

type Props = {
  open: boolean
  companyName: string
  contacts: CrmContact[]
  defaultSubject?: string
  defaultBody?: string
  zohoEnabled: boolean
  onClose: () => void
  /** Called after a successful send (Zoho) or mailto open. */
  onSent?: () => void | Promise<void>
  /** Makes the PDF to attach (quote, invoice). Sent attached from the person's own mailbox when it is connected. */
  attachPdf?: () => Promise<{ blob: Blob; filename: string }>
  /** Label for the attachment before it is made, e.g. "Quotation RR-01-26003.pdf". */
  attachLabel?: string
  /** Files the sent email in this record's email history (own mailbox only). */
  linkTo?: MailLinkTarget
}

/** The signed in person's own mailbox (Mail page), when it can send. */
type OwnBox = { address: string; canSend: boolean } | null

export default function EmailComposeModal({
  open,
  companyName,
  contacts,
  defaultSubject = '',
  defaultBody = '',
  zohoEnabled,
  onClose,
  onSent,
  attachPdf,
  attachLabel,
  linkTo,
}: Props) {
  const { settings } = useSettings()
  const { showToast } = useToast()
  const emails = useMemo(() => contactEmails(contacts), [contacts])
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [ownBox, setOwnBox] = useState<OwnBox>(null)
  const [attach, setAttach] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)
  const useOwn = Boolean(ownBox?.canSend)

  // Prefer the person's own mailbox (Mail page) when it is connected with send permission.
  useEffect(() => {
    if (!open || !isSupabaseConfigured()) return
    let live = true
    setAttach(true)
    getMailStatus()
      .then((st) => {
        if (live) setOwnBox(st.connected ? { address: st.address || '', canSend: Boolean(st.canSend) } : null)
      })
      .catch(() => {
        if (live) setOwnBox(null)
      })
    return () => {
      live = false
    }
  }, [open])

  async function downloadPdf() {
    if (!attachPdf) return
    setPdfBusy(true)
    try {
      const { blob, filename } = await attachPdf()
      downloadBlob(blob, filename)
      showToast('PDF downloaded. Attach it to the email.', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'PDF failed'), 'error')
    } finally {
      setPdfBusy(false)
    }
  }

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

  async function importComposeCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      if (!objects.length) {
        showToast('No email compose rows in CSV', 'error')
        return
      }

      const draftRow =
        objects.find((r) => String(r.kind || '').trim().toLowerCase() === 'draft') ||
        objects.find(
          (r) =>
            String(r.to || '').trim() ||
            String(r.subject || '').trim() ||
            String(r.body || '').trim(),
        ) ||
        null

      if (!draftRow) {
        showToast('CSV had no matching email draft fields', 'error')
        return
      }

      const nextTo = String(draftRow.to || draftRow.email || '').trim()
      const nextSubject = String(draftRow.subject ?? '').trim()
      const nextBody = String(draftRow.body ?? '')
      let applied = 0

      if (nextTo) {
        setTo(nextTo)
        applied += 1
      }
      if (draftRow.subject != null && String(draftRow.subject) !== '') {
        setSubject(nextSubject)
        applied += 1
      } else if (draftRow.subject != null) {
        setSubject('')
        applied += 1
      }
      if (draftRow.body != null) {
        setBody(nextBody)
        applied += 1
      }

      if (!applied) {
        showToast('CSV had no matching email draft fields', 'error')
        return
      }
      showToast('Email compose draft imported', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Email compose CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function handleSend() {
    const parsed = parseEmailComposeForm({ to, subject, body })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSending(true)
    try {
      if (useOwn) {
        const attachments = []
        if (attachPdf && attach) {
          const { blob, filename } = await attachPdf()
          attachments.push({ name: filename, base64: await blobToBase64(blob) })
        }
        const res = await sendMail(
          { mode: 'new', to: parsed.data.to, cc: '', bcc: '', subject: parsed.data.subject, text: parsed.data.body },
          undefined,
          { attachments, linkTo },
        )
        showToast(
          `Email sent from ${ownBox?.address || 'your mailbox'}${attachments.length ? ' with the PDF attached' : ''}${
            linkTo && res.linked ? ', and saved in this record’s emails' : ''
          }`,
          'success',
        )
        await onSent?.()
        onClose()
      } else if (zohoEnabled) {
        await getMailProvider(settings).sendMail(settings, parsed.data)
        showToast('Email sent via Zoho Mail', 'success')
        await onSent?.()
        onClose()
      } else {
        openMailto(parsed.data.to, parsed.data.subject, parsed.data.body)
        showToast('Opened mail client (Zoho Mail not enabled)', 'success')
        await onSent?.()
        onClose()
      }
    } catch (e) {
      showToast(errorMessage(e, 'Send failed'), 'error')
    } finally {
      setSending(false)
    }
  }

  function handleMailtoFallback() {
    const parsed = parseEmailComposeForm({ to, subject, body })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    openMailto(parsed.data.to, parsed.data.subject, parsed.data.body)
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
      {useOwn ? (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.muted2 }}>From: {ownBox?.address}</p>
      ) : null}
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
      {attachPdf ? (
        <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {useOwn ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} disabled={sending} />
              <Paperclip size={14} /> Attach {attachLabel || 'the PDF'}
            </label>
          ) : (
            <button type="button" style={buttonSecondaryStyle} onClick={() => void downloadPdf()} disabled={pdfBusy || sending}>
              <Download size={14} /> {pdfBusy ? 'Making PDF…' : 'Download PDF to attach'}
            </button>
          )}
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importComposeCsv(file)
          }}
        />
        <button
          type="button"
          style={buttonSecondaryStyle}
          disabled={sending || importing}
          onClick={() => importInputRef.current?.click()}
        >
          {importing ? 'Importing…' : 'Import CSV'}
        </button>
        <button
          type="button"
          style={buttonSecondaryStyle}
          disabled={sending || importing}
          onClick={() => {
            const contactRows = contacts
              .filter((c) => c.email)
              .map((c) => ({
                kind: 'contact',
                name: c.name || '',
                email: c.email || '',
                company: companyName,
              }))
            exportListCsv(
              `email-compose-${companyName.replace(/\s+/g, '-').toLowerCase() || 'draft'}.csv`,
              [...EMAIL_COMPOSE_CSV_COLUMNS],
              [
                ...contactRows,
                {
                  kind: 'draft',
                  name: '',
                  email: '',
                  company: companyName,
                  to,
                  subject,
                  body,
                },
              ],
            )
            showToast('Email compose CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
        <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={sending || importing}>
          Cancel
        </button>
        {zohoEnabled ? (
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={handleMailtoFallback}
            disabled={sending || importing}
          >
            Open mailto…
          </button>
        ) : null}
        <button
          type="button"
          style={buttonPrimaryStyle}
          onClick={() => void handleSend()}
          disabled={sending || importing}
        >
          <Mail size={14} />
          {sending ? 'Sending…' : useOwn ? 'Send' : zohoEnabled ? 'Send via Zoho' : 'Open mail app'}
        </button>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: colors.muted2 }}>
        {useOwn
          ? 'Sends from your own mailbox (Mail page) only when you press Send. It also shows in your Sent folder.'
          : ownBox && !ownBox.canSend
            ? 'To send from your own mailbox, open Mail and press Allow sending once.'
            : zohoEnabled
              ? 'Sends through Zoho Mail using credentials in Settings.'
              : 'Zoho Mail is off — opens your default mail client instead. Enable Zoho in Settings to send in-app.'}
      </p>
    </Modal>
  )
}
