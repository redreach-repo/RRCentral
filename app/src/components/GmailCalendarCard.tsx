import { useEffect, useState } from 'react'
import { Loader2, Plug } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import {
  disconnectGmail,
  getGmailStatus,
  startGmailConnect,
  type GmailStatus,
  GMAIL_OFF,
} from '../lib/gmailCalendarApi'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../lib/uiStyles'

/**
 * Settings card: connect Gmail send + Google Calendar (Phase A).
 * Inbox/Sent need Phase B restricted scopes — not requested here.
 */
export default function GmailCalendarCard() {
  const { userRole, isLocalMode } = useAuth()
  const { showToast } = useToast()
  const [status, setStatus] = useState<GmailStatus>(GMAIL_OFF)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const isAdmin = userRole === 'admin'

  async function reload() {
    setLoading(true)
    try {
      setStatus(await getGmailStatus())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load Gmail status'), 'error')
      setStatus(GMAIL_OFF)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('gmail')
    if (!result) return
    if (result === 'connected') showToast('Gmail connected (send + calendar)', 'success')
    else showToast(params.get('reason') || 'Gmail was not connected', 'error')
    params.delete('gmail')
    params.delete('reason')
    const q = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast])

  async function connect() {
    setBusy(true)
    try {
      await startGmailConnect()
    } catch (e) {
      showToast(errorMessage(e, 'Could not start Gmail sign in'), 'error')
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Gmail / Google Calendar? Follow-up sync will stop for the Gmail provider.')) {
      return
    }
    setBusy(true)
    try {
      await disconnectGmail()
      await reload()
      showToast('Gmail disconnected', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not disconnect'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="gmail" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Plug size={18} /> Gmail &amp; Google Calendar
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.55 }}>
        Phase A: send mail and sync follow-ups / meetings with{' '}
        <code style={{ color: '#ff9f4a' }}>gmail.send</code> +{' '}
        <code style={{ color: '#ff9f4a' }}>calendar.events</code> only. Inbox / Sent need Phase B
        (restricted scopes) — see Compliance notes. Prefer{' '}
        <code>GOOGLE_MAIL_CLIENT_ID</code> / <code>GOOGLE_MAIL_CLIENT_SECRET</code>; falls back to
        Drive&apos;s <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>. Add redirect URI{' '}
        <code style={{ color: '#ff9f4a' }}>{status.redirect_uri || '…/functions/v1/gmail-calendar'}</code>{' '}
        in Google Cloud Console, then deploy{' '}
        <code style={{ color: '#ff9f4a' }}>npx supabase functions deploy gmail-calendar</code>.
      </p>
      {isLocalMode ? (
        <p style={{ color: colors.warn, fontSize: 13 }}>Connect Supabase cloud to use Gmail OAuth.</p>
      ) : null}
      {loading ? (
        <p style={{ color: colors.muted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={14} className="spin" /> Checking connection…
        </p>
      ) : status.connected ? (
        <p style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
          Connected as <strong style={{ color: colors.text }}>{status.account_email || 'Google account'}</strong>
          . Select <strong style={{ color: colors.text }}>Gmail</strong> as the Mail &amp; calendar provider
          above to use it.
        </p>
      ) : (
        <p style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
          {status.configured
            ? 'Not connected yet.'
            : 'Google OAuth client secrets are not set on the Edge Functions yet.'}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {isAdmin && !status.connected ? (
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={busy || isLocalMode || !status.configured}
            onClick={() => void connect()}
          >
            {busy ? 'Starting…' : 'Connect Gmail'}
          </button>
        ) : null}
        {isAdmin && status.connected ? (
          <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void disconnect()}>
            {busy ? 'Working…' : 'Disconnect'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
