import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Plug } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useDriveStatus } from '../hooks/useDriveStatus'
import { errorMessage } from '../lib/errors'
import { disconnectDrive, startDriveConnect } from '../lib/googleDrive'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../lib/uiStyles'

const linkBtn = { ...buttonSecondaryStyle, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }

/**
 * Settings card: connect the company Google Drive once. RR Central then makes
 * RR Central / Customers / <client> folders, files emails and portal uploads there.
 */
export default function GoogleDriveCard() {
  const { userRole, isLocalMode } = useAuth()
  const { showToast } = useToast()
  const { status, loading, error, reload } = useDriveStatus()
  const [busy, setBusy] = useState(false)
  const isAdmin = userRole === 'admin'

  // Google sends the admin back here with ?drive=connected or ?drive=error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('drive')
    if (!result) return
    if (result === 'connected') showToast('Google Drive connected', 'success')
    else showToast(params.get('reason') || 'Google Drive was not connected', 'error')
    params.delete('drive')
    params.delete('reason')
    const q = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`)
    void reload()
  }, [reload, showToast])

  async function connect() {
    setBusy(true)
    try {
      await startDriveConnect()
    } catch (e) {
      showToast(errorMessage(e, 'Could not start the Google sign in'), 'error')
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Google Drive? Files and folders stay in Google Drive; RR Central stops adding to them.')) return
    setBusy(true)
    try {
      await disconnectDrive()
      await reload()
      showToast('Google Drive disconnected', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not disconnect'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={sectionTitleStyle}>Google Drive</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
        Customer and company files live in Google Drive; RR Central keeps the links. Once connected, RR Central makes a
        folder per client under <strong>RR Central / Customers</strong>, files matched emails and client portal uploads
        there, and you can paste Google Drive links on quotes, invoices and delivery notes. Share the RR Central folder
        with your team in Google Drive so they can open the files.
      </p>
      {isLocalMode ? (
        <p style={{ fontSize: 13, color: colors.muted }}>Google Drive needs RR Central connected to Supabase.</p>
      ) : loading ? (
        <p style={{ fontSize: 13, color: colors.muted }}>
          <Loader2 size={14} className="spin" style={{ verticalAlign: -2 }} /> Checking Google Drive…
        </p>
      ) : error ? (
        <p style={{ fontSize: 13, color: colors.warn }}>
          Could not reach Google Drive: {error}. Deploy the google-drive function (Actions → Deploy Edge Functions).
        </p>
      ) : !status.configured ? (
        <p style={{ fontSize: 13, color: colors.warn, lineHeight: 1.5 }}>
          Not set up yet. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> under Supabase → Edge
          Functions → Secrets. In Google Cloud, the OAuth client's redirect URI is{' '}
          <code style={{ overflowWrap: 'anywhere' }}>{status.redirect_uri || '…/functions/v1/google-drive'}</code>
        </p>
      ) : status.connected ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: colors.success, marginRight: 8 }}>
            Connected{status.account_email ? ` as ${status.account_email}` : ''}
          </span>
          {status.root_url ? (
            <a href={status.root_url} target="_blank" rel="noreferrer" style={linkBtn}>
              <ExternalLink size={14} /> RR Central folder
            </a>
          ) : null}
          {status.customers_url ? (
            <a href={status.customers_url} target="_blank" rel="noreferrer" style={linkBtn}>
              <ExternalLink size={14} /> Customers
            </a>
          ) : null}
          {status.company_url ? (
            <a href={status.company_url} target="_blank" rel="noreferrer" style={linkBtn}>
              <ExternalLink size={14} /> Company documents
            </a>
          ) : null}
          {isAdmin ? (
            <>
              <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void connect()}>
                Reconnect
              </button>
              <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void disconnect()}>
                Disconnect
              </button>
            </>
          ) : null}
        </div>
      ) : isAdmin ? (
        <button type="button" style={{ ...buttonPrimaryStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={busy} onClick={() => void connect()}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plug size={14} />} Connect Google Drive
        </button>
      ) : (
        <p style={{ fontSize: 13, color: colors.muted }}>Not connected. An admin connects Google Drive here.</p>
      )}
    </div>
  )
}
