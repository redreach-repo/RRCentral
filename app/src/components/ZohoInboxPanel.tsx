import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { CloudUpload, ExternalLink, FolderOpen, Loader2, Mail, Plug, RefreshCw } from 'lucide-react'
import type { CrmEntry } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { getMailProvider, type MailMessage } from '../lib/mailCalendar'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { attachCrmMatches, type InboxRow } from '../lib/zohoInboxMatch'
import { useDriveStatus } from '../hooks/useDriveStatus'
import { archiveSetupHint, scanAndFileCrmEmails } from '../lib/zohoEmailArchive'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  sectionTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import { useCompactCrm } from '../hooks/useMediaQuery'
import resp from '../styles/crmResponsive.module.css'
import { errorMessage } from '../lib/errors'

type Props = {
  crmEntries: CrmEntry[]
}

type Mailbox = 'inbox' | 'sent'
type Filter = 'all' | 'crm' | 'unread'

const MAIL_CSV_COLUMNS = [
  'mailbox',
  'subject',
  'from',
  'to',
  'sender',
  'status',
  'received',
  'has_attachment',
  'crm_company',
  'matched_email',
  'summary',
] as const

const RECEIVED_FMT = 'yyyy-MM-dd HH:mm'

function mailMatchKey(subject: string, from: string, to: string, received: string): string {
  return `${subject.trim().toLowerCase()}|${from.trim().toLowerCase()}|${to.trim().toLowerCase()}|${received.trim()}`
}

function formatReceived(ts: number): string {
  if (!ts) return ''
  try {
    return format(new Date(ts), RECEIVED_FMT)
  } catch {
    return ''
  }
}

function parseReceived(raw: string): number {
  const v = raw.trim()
  if (!v) return 0
  try {
    const d = parse(v, RECEIVED_FMT, new Date())
    if (!Number.isNaN(d.getTime())) return d.getTime()
  } catch {
    /* fall through */
  }
  const n = Date.parse(v)
  return Number.isNaN(n) ? 0 : n
}

function parseMailStatus(raw: string): 'read' | 'unread' {
  return raw.trim().toLowerCase() === 'unread' ? 'unread' : 'read'
}

function resolveCrmFromCsv(
  company: string,
  matchedEmail: string,
  entries: CrmEntry[],
): InboxRow['crm'] {
  const email = matchedEmail.trim().toLowerCase()
  const name = company.trim().toLowerCase()
  if (name) {
    const byName = entries.find((e) => (e.company_name || '').toLowerCase() === name)
    if (byName) {
      return {
        crmId: byName.id,
        companyName: byName.company_name,
        matchedEmail: matchedEmail.trim(),
      }
    }
  }
  if (email) {
    const byEmail = entries.find((e) => (e.email_phone || '').toLowerCase().includes(email))
    if (byEmail) {
      return {
        crmId: byEmail.id,
        companyName: byEmail.company_name,
        matchedEmail: matchedEmail.trim(),
      }
    }
  }
  if (company.trim()) {
    return { crmId: '', companyName: company.trim(), matchedEmail: matchedEmail.trim() }
  }
  return null
}

export default function ZohoInboxPanel({ crmEntries }: Props) {
  const { settings } = useSettings()
  const { user } = useAuth()
  const { showToast } = useToast()
  const compact = useCompactCrm()
  const [loading, setLoading] = useState(false)
  const [filing, setFiling] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<InboxRow[]>([])
  const [mailbox, setMailbox] = useState<Mailbox>('inbox')
  const [filter, setFilter] = useState<Filter>('all')
  const [lastScan, setLastScan] = useState('')
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [importedRows, setImportedRows] = useState<InboxRow[] | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const mail = getMailProvider(settings)
  const enabled = mail.isEnabled(settings)
  const configured = mail.isConfigured(settings)
  const driveOn = useDriveStatus().status.connected

  const load = useCallback(async () => {
    setCsvFiltered(false)
    setImportedRows(null)
    if (!enabled) return
    setLoading(true)
    setError('')
    try {
      let messages: MailMessage[]
      if (mailbox === 'sent') {
        messages = await mail.listSent(settings, { limit: 30 })
      } else {
        messages = await mail.listInbox(settings, { limit: 30, status: 'all' })
      }
      setRows(attachCrmMatches(messages, crmEntries))
    } catch (e) {
      setRows([])
      setError(errorMessage(e, 'Could not load Zoho mail'))
    } finally {
      setLoading(false)
    }
  }, [enabled, settings, crmEntries, mailbox, mail])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  async function runScanAndFile() {
    setFiling(true)
    setLastScan('')
    try {
      const summary = await scanAndFileCrmEmails({
        settings,
        driveConnected: driveOn,
        crmEntries,
        uploadedBy: user?.email || '',
        limitPerFolder: 25,
      })
      const line = `Scanned ${summary.scanned} · matched ${summary.matched} · filed ${summary.filed} · skipped ${summary.skipped} · errors ${summary.errors}`
      setLastScan(line)
      if (summary.filed > 0) {
        showToast(`Filed ${summary.filed} email(s) to Google Drive + CRM`, 'success')
      } else if (summary.errors > 0) {
        const firstErr = summary.results.find((r) => r.status === 'error')
        showToast(firstErr?.detail || 'Scan finished with errors', 'error')
      } else {
        showToast(
          summary.matched
            ? 'Nothing new to file — matches already archived'
            : 'No inbox/sent emails matched CRM contact emails',
          'success',
        )
      }
      await load()
    } catch (e) {
      showToast(archiveSetupHint(e), 'error')
    } finally {
      setFiling(false)
    }
  }

  const boardRows = csvFiltered && importedRows ? importedRows : rows

  const visible = boardRows.filter((r) => {
    if (filter === 'crm') return Boolean(r.crm)
    if (filter === 'unread') return r.status === 'unread'
    return true
  })

  const crmHits = boardRows.filter((r) => r.crm).length
  const unread = boardRows.filter((r) => r.status === 'unread').length

  async function importMailCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byKey = new Map(
        rows.map(
          (r) =>
            [
              mailMatchKey(
                r.subject,
                r.fromAddress,
                r.toAddress || '',
                formatReceived(r.receivedTime),
              ),
              r,
            ] as const,
        ),
      )
      const next: InboxRow[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const subject = String(row.subject || '').trim()
        const from = String(row.from || '').trim()
        const to = String(row.to || '').trim()
        const received = String(row.received || '').trim()
        if (!subject && !from && !to) {
          skipped += 1
          return
        }
        const key = mailMatchKey(subject, from, to, received)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existing = byKey.get(key)
        if (existing) {
          next.push(existing)
          matched += 1
          return
        }
        const crmCompany = String(row.crm_company || '').trim()
        const matchedEmail = String(row.matched_email || '').trim()
        next.push({
          messageId: `import-${idx}`,
          subject: subject || '—',
          fromAddress: from,
          toAddress: to || undefined,
          sender: String(row.sender || '').trim() || from,
          summary: String(row.summary || '').trim(),
          receivedTime: parseReceived(received),
          status: parseMailStatus(String(row.status || '')),
          hasAttachment:
            String(row.has_attachment || '')
              .trim()
              .toLowerCase() === 'yes',
          folderId: '',
          crm: resolveCrmFromCsv(crmCompany, matchedEmail, crmEntries),
        })
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching mail rows in CSV', 'error')
        return
      }
      setImportedRows(next)
      setCsvFiltered(true)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : '']
        .filter(Boolean)
        .join(', ')
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} mail row(s) (${parts})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Mail CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  if (!configured) {
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>
          <Mail size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Zoho mail
        </h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Connect Zoho Mail in{' '}
          <Link to="/settings" style={{ color: colors.accentText }}>
            Settings
          </Link>{' '}
          to see inbox and sent mail here, matched to CRM companies.
        </p>
      </div>
    )
  }

  if (!enabled) {
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>
          <Mail size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Zoho mail
        </h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Zoho credentials are saved, but Mail is set to <strong>no</strong>. Set{' '}
          <em>Mail (send + inbox)</em> to <strong>yes</strong> in Settings, and ensure your refresh
          token includes <code style={{ color: '#ff9f4a' }}>ZohoMail.messages.READ</code>.
        </p>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>
            <Mail size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Zoho mail
          </h2>
          <p style={{ color: colors.muted2, fontSize: 12, margin: '4px 0 0' }}>
            {boardRows.length
              ? `${mailbox === 'sent' ? 'Sent' : `${unread} unread`} · ${crmHits} matched to CRM`
              : mailbox === 'sent'
                ? 'Mail you sent from Zoho / CRM'
                : 'Mail others sent you (not your outbound quotes)'}
            {lastScan ? ` · Last scan: ${lastScan}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a
            href={mail.webUrl(settings)}
            target="_blank"
            rel="noreferrer"
            style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
          >
            <ExternalLink size={14} /> Open Zoho Mail
          </a>
          <button type="button" style={buttonSecondaryStyle} disabled={loading} onClick={() => void load()}>
            {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importMailCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing || loading}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={visible.length === 0}
            onClick={() => {
              exportListCsv(
                `zoho-mail-${mailbox}.csv`,
                [...MAIL_CSV_COLUMNS],
                visible.map((m) => ({
                  mailbox,
                  subject: m.subject,
                  from: m.fromAddress,
                  to: m.toAddress || '',
                  sender: m.sender,
                  status: m.status,
                  received: formatReceived(m.receivedTime),
                  has_attachment: m.hasAttachment ? 'yes' : 'no',
                  crm_company: m.crm?.companyName || '',
                  matched_email: m.crm?.matchedEmail || '',
                  summary: m.summary,
                })),
              )
              showToast('Mail CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={filing || loading}
            title={
              driveOn
                ? 'Scan inbox + sent, make customer folders in Google Drive, file matched emails into CRM'
                : 'Connect Google Drive in Settings first'
            }
            onClick={() => void runScanAndFile()}
          >
            {filing ? <Loader2 size={14} className="spin" /> : <CloudUpload size={14} />}
            {filing ? 'Filing…' : 'Scan & file to Google Drive'}
          </button>
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.muted, lineHeight: 1.45 }}>
        Matches mail by contact email on the CRM card. Filing makes the customer folder under RR
        Central / Customers in Google Drive (if missing), stores an HTML copy of the email there, and links it under{' '}
        <FolderOpen size={12} style={{ verticalAlign: -1 }} /> Customer files → Communications.
        {!driveOn ? (
          <>
            {' '}
            An admin connects <strong>Google Drive</strong> once in{' '}
            <Link to="/settings" style={{ color: colors.accentText }}>
              Settings
            </Link>
            .
          </>
        ) : null}
      </p>

      {csvFiltered ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
          Showing {boardRows.length} mail row{boardRows.length === 1 ? '' : 's'} from CSV (session only —
          Refresh clears).
        </p>
      ) : null}

      <div className={resp.chipRow} style={{ marginBottom: 8 }}>
        {(
          [
            ['inbox', 'Inbox'],
            ['sent', 'Sent'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMailbox(id)
              setFilter('all')
            }}
            style={{
              ...buttonSecondaryStyle,
              ...(mailbox === id
                ? { borderColor: colors.accent, color: colors.accentText, background: `${colors.accent}18` }
                : null),
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={resp.chipRow}>
        {(
          [
            ['all', `All (${boardRows.length})`],
            ['crm', `CRM matches (${crmHits})`],
            ...(mailbox === 'inbox' ? ([['unread', `Unread (${unread})`]] as const) : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            style={{
              ...buttonSecondaryStyle,
              ...(filter === id
                ? { borderColor: colors.accent, color: colors.accentText, background: `${colors.accent}18` }
                : null),
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: '#fca5a5',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 650, marginBottom: 4 }}>Mail unavailable</div>
          {error}
          <div style={{ marginTop: 8, color: colors.muted }}>
            Tip: regenerate your Zoho refresh token with{' '}
            <code style={{ color: '#ff9f4a' }}>ZohoMail.messages.READ</code> +{' '}
            <code style={{ color: '#ff9f4a' }}>ZohoMail.folders.READ</code> +{' '}
            <code style={{ color: '#ff9f4a' }}>ZohoMail.accounts.READ</code>
            , then Test connection in Settings.
          </div>
          <Link to="/settings" style={{ color: colors.accentText, display: 'inline-flex', gap: 6, marginTop: 10 }}>
            <Plug size={14} /> Settings → Zoho
          </Link>
        </div>
      ) : loading && !boardRows.length ? (
        <div style={{ color: colors.muted, fontSize: 13, padding: '20px 0' }}>
          <Loader2 size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Loading mail…
        </div>
      ) : visible.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '8px 0 0', lineHeight: 1.5 }}>
          {filter === 'crm'
            ? 'No recent emails match CRM contact addresses yet. Add the contact email on the company card.'
            : mailbox === 'sent'
              ? 'No sent messages yet. After you email a quote/invoice via Zoho, open Sent and hit Refresh.'
              : 'Inbox is empty here. Quotes you send appear under Sent — not Inbox.'}
        </p>
      ) : compact ? (
        <div className={resp.listStack} style={{ marginTop: 4 }}>
          {visible.map((m) => (
            <InboxCard key={m.messageId} message={m} mailbox={mailbox} />
          ))}
        </div>
      ) : (
        <div style={{ ...tableWrapStyle, marginTop: 4 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>{mailbox === 'sent' ? 'To' : 'From'}</th>
                <th style={thStyle}>Subject</th>
                <th style={thStyle}>CRM</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.messageId} style={m.status === 'unread' ? { fontWeight: 650 } : undefined}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: colors.muted2 }}>
                    {m.receivedTime ? format(new Date(m.receivedTime), 'dd MMM HH:mm') : '—'}
                  </td>
                  <td style={tdStyle}>
                    {mailbox === 'sent' ? (
                      <>
                        <div>{m.toAddress || '—'}</div>
                      </>
                    ) : (
                      <>
                        <div>{m.sender || m.fromAddress || '—'}</div>
                        {m.sender && m.fromAddress ? (
                          <div style={{ fontSize: 11, color: colors.muted2 }}>{m.fromAddress}</div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div>{m.subject}</div>
                    {m.summary ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: colors.muted2,
                          marginTop: 2,
                          maxWidth: 420,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.summary}
                      </div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    {m.crm ? (
                      <Link
                        to={`/crm?edit=${m.crm.crmId}`}
                        style={{ color: colors.accentText, textDecoration: 'none' }}
                      >
                        {m.crm.companyName}
                      </Link>
                    ) : (
                      <span style={{ color: colors.muted2 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InboxCard({ message: m, mailbox }: { message: InboxRow; mailbox: Mailbox }) {
  return (
    <article className={resp.card} style={m.status === 'unread' ? { borderColor: 'rgba(232,93,4,0.45)' } : undefined}>
      <div className={resp.cardTop}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className={resp.cardTitle} style={{ cursor: 'default' }}>
            {m.subject}
          </div>
          <div className={resp.cardMeta}>
            {mailbox === 'sent' ? m.toAddress || '—' : m.sender || m.fromAddress}
            {m.receivedTime ? ` · ${format(new Date(m.receivedTime), 'dd MMM HH:mm')}` : ''}
          </div>
          {m.crm ? (
            <Link to={`/crm?edit=${m.crm.crmId}`} style={{ color: colors.accentText, fontSize: 12 }}>
              {m.crm.companyName}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}
