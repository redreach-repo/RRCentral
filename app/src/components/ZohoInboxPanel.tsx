import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ExternalLink, Loader2, Mail, Plug, RefreshCw } from 'lucide-react'
import type { CrmEntry } from '../lib/types'
import { useSettings } from '../contexts/SettingsContext'
import {
  isZohoConfigured,
  isZohoMailEnabled,
  listZohoInboxMessages,
  zohoMailWebUrl,
} from '../lib/zoho'
import { attachCrmMatches, type InboxRow } from '../lib/zohoInboxMatch'
import {
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

export default function ZohoInboxPanel({ crmEntries }: Props) {
  const { settings } = useSettings()
  const compact = useCompactCrm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<InboxRow[]>([])
  const [filter, setFilter] = useState<'all' | 'crm' | 'unread'>('all')

  const enabled = isZohoMailEnabled(settings)
  const configured = isZohoConfigured(settings)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError('')
    try {
      const messages = await listZohoInboxMessages(settings, { limit: 30, status: 'all' })
      setRows(attachCrmMatches(messages, crmEntries))
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Could not load Zoho inbox')
    } finally {
      setLoading(false)
    }
  }, [enabled, settings, crmEntries])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

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
          Zoho inbox
        </h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Connect Zoho Mail in{' '}
          <Link to="/settings" style={{ color: colors.accent }}>
            Settings
          </Link>{' '}
          to see your inbox here, matched to CRM companies.
        </p>
      </div>
    )
  }

  if (!enabled) {
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>
          <Mail size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Zoho inbox
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
            Zoho inbox
          </h2>
          <p style={{ color: colors.muted2, fontSize: 12, margin: '4px 0 0' }}>
            {rows.length
              ? `${unread} unread · ${crmHits} matched to CRM`
              : 'Recent mail from your Zoho account'}
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
        </div>
      </div>

      <div className={resp.chipRow}>
        {(
          [
            ['all', `All (${rows.length})`],
            ['crm', `CRM matches (${crmHits})`],
            ['unread', `Unread (${unread})`],
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
          <div style={{ fontWeight: 650, marginBottom: 4 }}>Inbox unavailable</div>
          {error}
          <div style={{ marginTop: 8, color: colors.muted }}>
            Tip: regenerate your Zoho refresh token with{' '}
            <code style={{ color: '#ff9f4a' }}>ZohoMail.messages.READ</code> +{' '}
            <code style={{ color: '#ff9f4a' }}>ZohoMail.folders.READ</code> +{' '}
            <code style={{ color: '#ff9f4a' }}>ZohoMail.accounts.READ</code>, then Test connection in
            Settings.
          </div>
          <Link to="/settings" style={{ color: colors.accent, display: 'inline-flex', gap: 6, marginTop: 10 }}>
            <Plug size={14} /> Settings → Zoho
          </Link>
        </div>
      ) : loading && !rows.length ? (
        <div style={{ color: colors.muted, fontSize: 13, padding: '20px 0' }}>
          <Loader2 size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Loading inbox…
        </div>
      ) : visible.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '8px 0 0' }}>
          {filter === 'crm'
            ? 'No recent emails match CRM contact addresses yet.'
            : 'No messages in this view.'}
        </p>
      ) : compact ? (
        <div className={resp.listStack} style={{ marginTop: 4 }}>
          {visible.map((m) => (
            <InboxCard key={m.messageId} message={m} />
          ))}
        </div>
      ) : (
        <div style={{ ...tableWrapStyle, marginTop: 4 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>From</th>
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
                    <div>{m.sender || m.fromAddress || '—'}</div>
                    {m.sender && m.fromAddress ? (
                      <div style={{ fontSize: 11, color: colors.muted2 }}>{m.fromAddress}</div>
                    ) : null}
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

function InboxCard({ message: m }: { message: InboxRow }) {
  return (
    <article className={resp.card} style={m.status === 'unread' ? { borderColor: 'rgba(232,93,4,0.45)' } : undefined}>
      <div className={resp.cardTop}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className={resp.cardTitle} style={{ cursor: 'default' }}>
            {m.subject}
          </div>
          <div className={resp.cardMeta}>
            {m.sender || m.fromAddress}
            {m.receivedTime ? ` · ${format(new Date(m.receivedTime), 'dd MMM HH:mm')}` : ''}
            {m.status === 'unread' ? ' · Unread' : ''}
          </div>
        </div>
      </div>
      {m.summary ? <div className={resp.cardMeta}>{m.summary.slice(0, 160)}</div> : null}
      {m.crm ? (
        <Link to={`/crm?edit=${m.crm.crmId}`} style={{ color: colors.accent, fontSize: 13, textDecoration: 'none' }}>
          CRM: {m.crm.companyName}
        </Link>
      ) : (
        <span className={resp.cardMeta}>No CRM match</span>
      )}
    </article>
  )
}
