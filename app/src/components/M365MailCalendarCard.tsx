import { useEffect, useState } from 'react'
import { Loader2, Plug } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import {
  disconnectM365,
  getM365Status,
  startM365Connect,
  type M365Status,
  M365_OFF,
} from '../lib/m365MailCalendarApi'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../lib/uiStyles'

/** Settings card: connect Microsoft 365 send + calendar (Phase A). */
export default function M365MailCalendarCard() {
  const { userRole, isLocalMode } = useAuth()
  const { showToast } = useToast()
  const [status, setStatus] = useState<M365Status>(M365_OFF)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const isAdmin = userRole === 'admin'

  async function reload() {
    setLoading(true)
    try {
      setStatus(await getM365Status())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load Microsoft 365 status'), 'error')
      setStatus(M365_OFF)
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
    const result = params.get('m365')
    if (!result) return
    if (result === 'connected') showToast('Microsoft 365 connected (send + calendar)', 'success')
    else showToast(params.get('reason') || 'Microsoft 365 was not connected', 'error')
    params.delete('m365')
    params.delete('reason')
    const q = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast])

  async function connect() {
    setBusy(true)
    try {
      await startM365Connect()
    } catch (e) {
      showToast(errorMessage(e, 'Could not start Microsoft sign in'), 'error')
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Microsoft 365? Follow-up sync will stop for the M365 provider.')) return
    setBusy(true)
    try {
      await disconnectM365()
      await reload()
      showToast('Microsoft 365 disconnected', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not disconnect'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="m365" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Plug size={18} /> Microsoft 365
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.55 }}>
        Phase A: send mail and sync follow-ups / meetings with delegated{' '}
        <code style={{ color: '#ff9f4a' }}>Mail.Send</code> +{' '}
        <code style={{ color: '#ff9f4a' }}>Calendars.ReadWrite</code>. Inbox needs Phase B (
        <code style={{ color: '#ff9f4a' }}>Mail.Read</code>). Set Edge secrets{' '}
        <code>MICROSOFT_CLIENT_ID</code> / <code>MICROSOFT_CLIENT_SECRET</code> (optional{' '}
        <code>MICROSOFT_TENANT_ID</code>, default <code>common</code>). Add redirect URI{' '}
        <code style={{ color: '#ff9f4a' }}>
          {status.redirect_uri || '…/functions/v1/m365-mail-calendar'}
        </code>
        , then deploy{' '}
        <code style={{ color: '#ff9f4a' }}>npx supabase functions deploy m365-mail-calendar</code>.
      </p>
      {isLocalMode ? (
        <p style={{ color: colors.warn, fontSize: 13 }}>Connect Supabase cloud to use Microsoft OAuth.</p>
      ) : null}
      {loading ? (
        <p style={{ color: colors.muted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={14} /> Checking connection…
        </p>
      ) : status.connected ? (
        <p style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
          Connected as <strong style={{ color: colors.text }}>{status.account_email || 'Microsoft account'}</strong>
          . Select <strong style={{ color: colors.text }}>Microsoft 365</strong> as the provider above to use it.
        </p>
      ) : (
        <p style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
          {status.configured
            ? 'Not connected yet.'
            : 'Microsoft OAuth client secrets are not set on the Edge Functions yet.'}
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
            {busy ? 'Starting…' : 'Connect Microsoft 365'}
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
