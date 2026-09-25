import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { CloudUpload, ExternalLink, FolderOpen, Loader2, Mail, Plug, RefreshCw } from 'lucide-react'
import type { CrmEntry } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import {
  isZohoConfigured,
  isZohoMailEnabled,
  listZohoInboxMessages,
  listZohoSentMessages,
  zohoMailWebUrl,
  type ZohoInboxMessage,
} from '../lib/zoho'
import { attachCrmMatches, type InboxRow } from '../lib/zohoInboxMatch'
import { isZohoWorkDriveEnabled } from '../lib/zohoWorkDrive'
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

type Props = {
  crmEntries: CrmEntry[]
}

type Mailbox = 'inbox' | 'sent'
type Filter = 'all' | 'crm' | 'unread'

export default function ZohoInboxPanel({ crmEntries }: Props) {
  const { settings } = useSettings()
  const { user } = useAuth()
  const { showToast } = useToast()
  const compact = useCompactCrm()
  const [loading, setLoading] = useState(false)
  const [filing, setFiling] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<InboxRow[]>([])
  const [mailbox, setMailbox] = useState<Mailbox>('inbox')
  const [filter, setFilter] = useState<Filter>('all')
  const [lastScan, setLastScan] = useState('')

  const enabled = isZohoMailEnabled(settings)
  const configured = isZohoConfigured(settings)
  const workDriveOn = isZohoWorkDriveEnabled(settings)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError('')
    try {
      let messages: ZohoInboxMessage[]
      if (mailbox === 'sent') {
        messages = await listZohoSentMessages(settings, { limit: 30 })
      } else {
        messages = await listZohoInboxMessages(settings, { limit: 30, status: 'all' })
      }
      setRows(attachCrmMatches(messages, crmEntries))
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Could not load Zoho mail')
    } finally {
      setLoading(false)
    }
  }, [enabled, settings, crmEntries, mailbox])

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
        crmEntries,
        uploadedBy: user?.email || '',
        limitPerFolder: 25,
      })
      const line = `Scanned ${summary.scanned} · matched ${summary.matched} · filed ${summary.filed} · skipped ${summary.skipped} · errors ${summary.errors}`
      setLastScan(line)
      if (summary.filed > 0) {
        showToast(`Filed ${summary.filed} email(s) to WorkDrive + CRM`, 'success')
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

  const visible = rows.filter((r) => {
    if (filter === 'crm') return Boolean(r.crm)
    if (filter === 'unread') return r.status === 'unread'
    return true
  })

  const crmHits = rows.filter((r) => r.crm).length
  const unread = rows.filter((r) => r.status === 'unread').length

  if (!configured) {
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>
          <Mail size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Zoho mail
        </h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Connect Zoho Mail in{' '}
          <Link to="/settings" style={{ color: colors.accent }}>
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
            {rows.length
              ? `${mailbox === 'sent' ? 'Sent' : `${unread} unread`} · ${crmHits} matched to CRM`
              : mailbox === 'sent'
                ? 'Mail you sent from Zoho / CRM'
                : 'Mail others sent you (not your outbound quotes)'}
            {lastScan ? ` · Last scan: ${lastScan}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a
            href={zohoMailWebUrl(settings)}
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
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={filing || loading}
            title={
              workDriveOn
                ? 'Scan inbox + sent, create customer WorkDrive folders, file matched emails into CRM'
                : 'Enable WorkDrive in Settings first'
            }
            onClick={() => void runScanAndFile()}
          >
            {filing ? <Loader2 size={14} className="spin" /> : <CloudUpload size={14} />}
            {filing ? 'Filing…' : 'Scan & file to WorkDrive'}
          </button>
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.muted, lineHeight: 1.45 }}>
        Matches mail by contact email on the CRM card. Filing creates the customer folder under your
        Customers root (if missing), stores an HTML copy of the email in WorkDrive, and links it under{' '}
        <FolderOpen size={12} style={{ verticalAlign: -1 }} /> Customer files → Communications.
        {!workDriveOn ? (
          <>
            {' '}
            Set <strong>WorkDrive</strong> to <em>yes</em> and the Customers root folder in{' '}
            <Link to="/settings" style={{ color: colors.accent }}>
              Settings
            </Link>
            .
          </>
        ) : null}
      </p>

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
                ? { borderColor: colors.accent, color: colors.accent, background: `${colors.accent}18` }
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
            ['all', `All (${rows.length})`],
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
                ? { borderColor: colors.accent, color: colors.accent, background: `${colors.accent}18` }
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
            {workDriveOn ? (
              <>
                {' '}
                + <code style={{ color: '#ff9f4a' }}>WorkDrive.files.CREATE</code> +{' '}
                <code style={{ color: '#ff9f4a' }}>WorkDrive.links.CREATE</code>
              </>
            ) : null}
            , then Test connection in Settings.
          </div>
          <Link to="/settings" style={{ color: colors.accent, display: 'inline-flex', gap: 6, marginTop: 10 }}>
            <Plug size={14} /> Settings → Zoho
          </Link>
        </div>
      ) : loading && !rows.length ? (
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
                        style={{ color: colors.accent, textDecoration: 'none' }}
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
            <Link to={`/crm?edit=${m.crm.crmId}`} style={{ color: colors.accent, fontSize: 12 }}>
              {m.crm.companyName}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}
