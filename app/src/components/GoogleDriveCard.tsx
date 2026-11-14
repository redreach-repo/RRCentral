import { useEffect, useState } from 'react'
import { CloudUpload, ExternalLink, Loader2, Plug } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { useDriveStatus } from '../hooks/useDriveStatus'
import { errorMessage } from '../lib/errors'
import { fileQuotesAndInvoicesToDrive, type FileDocsSummary } from '../lib/fileDocsToDrive'
import { disconnectDrive, startDriveConnect } from '../lib/googleDrive'
import { PRODUCT } from '../lib/product'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../lib/uiStyles'

const linkBtn = { ...buttonSecondaryStyle, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }

/**
 * Settings card: connect the company Google Drive once. RR Central then makes
 * RR Central / Customers / <client> folders, files emails and portal uploads there.
 */
export default function GoogleDriveCard() {
  const { user, userRole, isLocalMode } = useAuth()
  const { t } = useI18n()
  const { showToast } = useToast()
  const { status, loading, error, reload } = useDriveStatus()
  const [busy, setBusy] = useState(false)
  const [filing, setFiling] = useState(false)
  const [progress, setProgress] = useState('')
  const [lastRun, setLastRun] = useState<FileDocsSummary | null>(null)
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
    if (!window.confirm(`Disconnect Google Drive? Files and folders stay in Google Drive; ${PRODUCT.name} stops adding to them.`)) return
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

  async function fileAllDocs() {
    if (
      !window.confirm(
        'File every quotation and invoice as PDFs into each client’s Google Drive folder? Earlier bulk HTML files will be replaced with PDFs. Keep this tab open until it finishes.',
      )
    ) {
      return
    }
    setFiling(true)
    setProgress('Starting…')
    setLastRun(null)
    try {
      const summary = await fileQuotesAndInvoicesToDrive({
        uploadedBy: user?.email || '',
        onProgress: (p) => setProgress(`${p.done + 1}/${p.total}: ${p.current}`),
      })
      setLastRun(summary)
      setProgress('')
      showToast(
        `Drive filing done: ${summary.filed} filed, ${summary.skipped} skipped, ${summary.errors} errors`,
        summary.errors ? 'error' : 'success',
      )
    } catch (e) {
      showToast(errorMessage(e, 'Could not file documents to Google Drive'), 'error')
      setProgress('')
    } finally {
      setFiling(false)
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={sectionTitleStyle}>{t('page.settings.section.googleDrive')}</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
        All documents live in Google Drive; {PRODUCT.name} only keeps the share links. Once connected, {PRODUCT.name}{' '}
        makes a folder per client under <strong>RR Central / Customers</strong>, files matched emails and portal uploads
        there, and <strong>Save to Drive</strong> on quotes, invoices and delivery notes uploads the PDF. Company papers
        sit under <strong>Company documents</strong>. Share the root Drive folder with your team.
      </p>
      {isLocalMode ? (
        <p style={{ fontSize: 13, color: colors.muted }}>
          Google Drive needs {PRODUCT.name} connected to Supabase.
        </p>
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
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: colors.success, marginRight: 8 }}>
              Connected{status.account_email ? ` as ${status.account_email}` : ''}
            </span>
            {status.root_url ? (
              <a href={status.root_url} target="_blank" rel="noreferrer" style={linkBtn}>
                <ExternalLink size={14} /> {PRODUCT.name} folder
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
                <button type="button" style={buttonSecondaryStyle} disabled={busy || filing} onClick={() => void connect()}>
                  Reconnect
                </button>
                <button type="button" style={buttonSecondaryStyle} disabled={busy || filing} onClick={() => void disconnect()}>
                  Disconnect
                </button>
              </>
            ) : null}
          </div>

          {isAdmin || userRole === 'manager' || userRole === 'sales' ? (
            <div
              style={{
                borderTop: `1px solid ${colors.border}`,
                paddingTop: 12,
                display: 'grid',
                gap: 8,
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>
                Push every quotation and invoice as <strong>PDFs</strong> into the matching client folder under{' '}
                <strong>RR Central / Customers</strong>. Creates the folder if needed. Replaces earlier bulk HTML
                filings. For letterhead branding on one document, open it and use <strong>Save to Drive</strong>.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  style={{ ...buttonPrimaryStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  disabled={filing || busy}
                  onClick={() => void fileAllDocs()}
                >
                  {filing ? <Loader2 size={14} className="spin" /> : <CloudUpload size={14} />}
                  {filing ? 'Filing…' : 'File all quotes & invoices to Drive'}
                </button>
                {progress ? <span style={{ fontSize: 12, color: colors.muted }}>{progress}</span> : null}
              </div>
              {lastRun ? (
                <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
                  Last run: {lastRun.scanned} scanned · {lastRun.filed} filed · {lastRun.skipped} skipped ·{' '}
                  {lastRun.errors} errors
                  {lastRun.results.some((r) => r.status === 'error') ? (
                    <>
                      <br />
                      {lastRun.results
                        .filter((r) => r.status === 'error')
                        .slice(0, 5)
                        .map((r) => `${r.ref || r.id}: ${r.detail}`)
                        .join(' · ')}
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
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
