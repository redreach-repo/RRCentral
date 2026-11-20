import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Building2, Image as ImageIcon, Inbox, Link2, Mail, Paperclip, RefreshCw, Search, Unlink, X } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import EmptyState from '../../../components/EmptyState'
import { db } from '../../../lib/db'
import { errorMessage } from '../../../lib/errors'
import type { CrmEntry } from '../../../lib/types'
import {
  MAIL_ROLES,
  counterpart,
  emailFrameDoc,
  hasRemoteImages,
  mailWhen,
  matchMailToCrm,
  type MailFolder,
  type MailListItem,
  type MailMessageFull,
  type MailRow,
} from '../../../lib/mailInbox/mailInbox'
import {
  MailSetupError,
  disconnectMail,
  getMailMessage,
  getMailStatus,
  listMail,
  listMailFolders,
  searchMail,
  startMailConnect,
} from '../../../lib/mailInbox/mailInboxApi'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  inputStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from '../../../lib/uiStyles'
import s from './Mail.module.css'

const PAGE = 30
const smallBtn = { ...buttonSecondaryStyle, padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }

type Setup =
  | { state: 'loading' }
  | { state: 'ready'; address: string }
  | { state: 'connect' }
  | { state: 'off'; reason: string }

/** This page's address without Zoho's answer in it, for Zoho to send the person back to. */
function returnUrl(): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('mail')
  url.searchParams.delete('reason')
  return url.toString()
}

export default function MailPage() {
  const { userRole: role } = useAuth()
  const allowed = (MAIL_ROLES as readonly string[]).includes(role)

  const [params, setParams] = useSearchParams()
  const [setup, setSetup] = useState<Setup>({ state: 'loading' })
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [folders, setFolders] = useState<MailFolder[]>([])
  const [folderId, setFolderId] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [items, setItems] = useState<MailListItem[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [crm, setCrm] = useState<CrmEntry[]>([])
  const [open, setOpen] = useState<MailRow | null>(null)
  const [full, setFull] = useState<MailMessageFull | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState('')
  const [showImages, setShowImages] = useState(false)
  const listSeq = useRef(0)
  const readSeq = useRef(0)

  const folder = folders.find((f) => f.folderId === folderId)
  const isSent = !activeSearch && folder?.kind === 'sent'
  const rows = useMemo(() => matchMailToCrm(items, crm), [items, crm])

  // Zoho sends the person back here with ?mail=connected or ?mail=error&reason=…
  useEffect(() => {
    const result = params.get('mail')
    if (!result) return
    setNotice(
      result === 'connected'
        ? { ok: true, text: 'Your mailbox is connected.' }
        : { ok: false, text: params.get('reason') || 'Your mailbox could not be connected.' },
    )
    const next = new URLSearchParams(params)
    next.delete('mail')
    next.delete('reason')
    setParams(next, { replace: true })
  }, [params, setParams])

  // Your mailbox status and folders, then CRM companies for matching.
  useEffect(() => {
    if (!allowed) return
    let gone = false
    setSetup({ state: 'loading' })
    ;(async () => {
      try {
        const st = await getMailStatus()
        if (gone) return
        if (!st.ready) {
          setSetup({
            state: 'off',
            reason: 'An admin adds the Zoho app and the mail key in Supabase first (ZOHO_MAIL_CLIENT_ID, ZOHO_MAIL_CLIENT_SECRET, MAIL_TOKEN_KEY).',
          })
          return
        }
        if (!st.connected) {
          setSetup({ state: 'connect' })
          return
        }
        const fs = await listMailFolders()
        if (gone) return
        setFolders(fs)
        setFolderId((fs.find((f) => f.kind === 'inbox') || fs[0])?.folderId || '')
        setSetup({ state: 'ready', address: st.address })
      } catch (e) {
        if (gone) return
        if (e instanceof MailSetupError && /connect your mailbox|connect your zoho/i.test(e.message)) {
          setNotice({ ok: false, text: e.message })
          setSetup({ state: 'connect' })
          return
        }
        setSetup({ state: 'off', reason: e instanceof MailSetupError ? e.message : errorMessage(e, 'Could not open your mailbox') })
      }
    })()
    db.from('crm')
      .select('*')
      .then((res: { data: CrmEntry[] | null }) => {
        if (!gone) setCrm(res.data || [])
      })
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [allowed, reloadKey])

  async function connect() {
    setBusy(true)
    setNotice(null)
    try {
      window.location.assign(await startMailConnect(returnUrl()))
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e, 'Could not start the Zoho sign in') })
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await disconnectMail()
      setOpen(null)
      setItems([])
      setFolders([])
      setConfirmOff(false)
      setNotice({ ok: true, text: 'Your mailbox is disconnected and its key removed.' })
      setReloadKey((k) => k + 1)
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e, 'Could not disconnect') })
    } finally {
      setBusy(false)
    }
  }

  const load = useCallback(
    async (append: boolean) => {
      if (setup.state !== 'ready') return
      if (!activeSearch && !folderId) return
      const seq = ++listSeq.current
      setLoading(true)
      setError('')
      const start = append ? items.length + 1 : 1
      try {
        const page = activeSearch
          ? await searchMail(activeSearch, { start, limit: PAGE })
          : await listMail(folderId, { start, limit: PAGE, unread: unreadOnly })
        if (seq !== listSeq.current) return
        setItems((prev) => (append ? [...prev, ...page] : page))
        setMore(page.length === PAGE)
      } catch (e) {
        if (seq !== listSeq.current) return
        if (!append) setItems([])
        setError(errorMessage(e, 'Could not load mail'))
      } finally {
        if (seq === listSeq.current) setLoading(false)
      }
    },
    [setup.state, activeSearch, folderId, unreadOnly, items.length],
  )

  // Reload the list when the folder, filter or search changes (not when items change).
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    void loadRef.current(false)
  }, [setup.state, folderId, unreadOnly, activeSearch])

  async function openMessage(row: MailRow) {
    const seq = ++readSeq.current
    setOpen(row)
    setFull(null)
    setReadError('')
    setShowImages(false)
    if (!row.folderId) {
      setReadError('This email has no folder, so it cannot be opened here.')
      return
    }
    setReading(true)
    try {
      const m = await getMailMessage(row.folderId, row.messageId)
      if (seq === readSeq.current) setFull(m)
    } catch (e) {
      if (seq === readSeq.current) setReadError(errorMessage(e, 'Could not open this email'))
    } finally {
      if (seq === readSeq.current) setReading(false)
    }
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q.length === 1) {
      setError('Type at least 2 characters to search')
      return
    }
    setOpen(null)
    setActiveSearch(q)
  }

  function clearSearch() {
    setQuery('')
    setActiveSearch('')
    setOpen(null)
  }

  if (!allowed) {
    return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>Mail</h1>
        <EmptyState icon={<Mail size={24} />} title="Mail is for admin, manager and sales" subtitle="Ask an admin if you need the company mailbox." />
      </div>
    )
  }

  const frameDoc = full ? emailFrameDoc(full.html, { showImages }) : ''
  const remote = full ? hasRemoteImages(full.html) : false
  const matched = open ? rows.find((r) => r.messageId === open.messageId)?.crm ?? open.crm : null

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={pageTitleStyle}>Mail</h1>
          <p style={{ ...pageSubtitleStyle, margin: '0 0 16px' }}>
            {setup.state === 'ready' && setup.address ? `${setup.address} · ` : ''}
            Your own Zoho mailbox. Only you can see it. Emails from clients in the CRM are tagged with the company.
          </p>
        </div>
        {setup.state === 'ready' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={smallBtn} onClick={() => void load(false)} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
            {!confirmOff ? (
              <button type="button" style={smallBtn} onClick={() => setConfirmOff(true)} disabled={busy}>
                <Unlink size={14} /> Disconnect
              </button>
            ) : (
              <>
                <button type="button" style={{ ...smallBtn, color: colors.danger }} onClick={() => void disconnect()} disabled={busy}>
                  Yes, disconnect
                </button>
                <button type="button" style={smallBtn} onClick={() => setConfirmOff(false)} disabled={busy}>
                  Keep it
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} style={{ color: notice.ok ? colors.success : colors.danger, fontSize: 13, margin: '0 0 12px' }}>
          {notice.text}
        </p>
      )}

      {setup.state === 'connect' && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20, background: colors.card, display: 'grid', gap: 10, maxWidth: 560 }}>
          <strong>Connect your Zoho mailbox</strong>
          <span className={s.muted}>
            Sign in to Zoho with your own work address. RR Central can then read your mail (not send it yet). Your key is
            stored encrypted and nobody else in RR Central, admins included, can open your mailbox. You can disconnect at any time.
          </span>
          <div>
            <button type="button" style={{ ...buttonPrimaryStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={() => void connect()} disabled={busy}>
              <Link2 size={16} /> {busy ? 'Opening Zoho…' : 'Connect my mailbox'}
            </button>
          </div>
        </div>
      )}

      {setup.state === 'loading' && <p className={s.muted}>Opening your mailbox…</p>}

      {setup.state === 'off' && (
        <div role="status" style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, background: colors.card, display: 'grid', gap: 6 }}>
          <strong>Mail is not set up yet</strong>
          <span className={s.muted}>{setup.reason}</span>
          <span className={s.muted}>
            Steps: <code>docs/mail.md</code>
          </span>
        </div>
      )}

      {setup.state === 'ready' && (
        <div className={s.layout}>
          <nav className={`${s.pane} ${s.folders} ${open ? s.hideNarrow : ''}`} aria-label="Mail folders">
            {folders.map((f) => (
              <button
                key={f.folderId}
                type="button"
                className={`${s.folder} ${!activeSearch && f.folderId === folderId ? s.folderActive : ''}`}
                onClick={() => {
                  setActiveSearch('')
                  setQuery('')
                  setOpen(null)
                  setFolderId(f.folderId)
                }}
              >
                <span className={s.ellipsis}>{f.name}</span>
                {f.unread > 0 && <span className={s.count}>{f.unread}</span>}
              </button>
            ))}
          </nav>

          <section className={`${s.pane} ${open ? s.hideNarrow : ''}`} aria-label="Emails">
            <form onSubmit={runSearch} style={{ display: 'flex', gap: 6, padding: 8, borderBottom: `1px solid ${colors.border}` }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search all mail"
                aria-label="Search all mail"
                style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '6px 10px' }}
              />
              <button type="submit" style={smallBtn} aria-label="Search">
                <Search size={14} />
              </button>
              {activeSearch && (
                <button type="button" style={smallBtn} onClick={clearSearch} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </form>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: `1px solid ${colors.border}` }}>
              <span className={s.muted}>{activeSearch ? `Results for “${activeSearch}”` : folder?.name || ''}</span>
              {!activeSearch && (
                <label className={s.muted} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only
                </label>
              )}
            </div>
            {error && (
              <p role="alert" style={{ color: colors.danger, fontSize: 13, padding: '8px 12px', margin: 0 }}>
                {error}
              </p>
            )}
            <div className={s.list}>
              {rows.map((r) => (
                <button
                  key={`${r.folderId}:${r.messageId}`}
                  type="button"
                  className={`${s.row} ${open?.messageId === r.messageId ? s.rowActive : ''}`}
                  onClick={() => void openMessage(r)}
                >
                  <span className={s.rowTop}>
                    <span className={`${s.ellipsis} ${r.unread ? s.unread : ''}`}>
                      {isSent ? `To: ${counterpart(r, true)}` : counterpart(r, false)}
                    </span>
                    <span className={s.muted} style={{ flexShrink: 0, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      {r.hasAttachment && <Paperclip size={12} aria-label="Has attachments" />}
                      {mailWhen(r.receivedTime)}
                    </span>
                  </span>
                  <span className={`${s.ellipsis} ${r.unread ? s.unread : ''}`} style={{ fontSize: 13 }}>
                    {r.subject}
                  </span>
                  {r.summary && <span className={`${s.ellipsis} ${s.muted}`}>{r.summary}</span>}
                  {r.crm && (
                    <span>
                      <span className={s.chip}>
                        <Building2 size={11} /> <span className={s.ellipsis}>{r.crm.companyName}</span>
                      </span>
                    </span>
                  )}
                </button>
              ))}
              {!loading && rows.length === 0 && !error && (
                <EmptyState icon={<Inbox size={24} />} title={activeSearch ? 'Nothing found' : 'No emails here'} />
              )}
              {loading && <p className={s.muted} style={{ padding: 12, margin: 0 }}>Loading…</p>}
              {!loading && more && (
                <div style={{ padding: 10, textAlign: 'center' }}>
                  <button type="button" style={smallBtn} onClick={() => void load(true)}>
                    Load more
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className={`${s.pane} ${open ? '' : s.hideNarrow}`} aria-label="Email">
            {!open && <EmptyState icon={<Mail size={24} />} title="Pick an email to read it" />}
            {open && (
              <div className={s.reader}>
                <div className={s.back}>
                  <button type="button" style={smallBtn} onClick={() => setOpen(null)}>
                    <ArrowLeft size={14} /> Back
                  </button>
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 650, margin: 0, overflowWrap: 'anywhere' }}>{full?.subject || open.subject}</h2>
                <div style={{ display: 'grid', gap: 2, fontSize: 13, overflowWrap: 'anywhere' }}>
                  <span>
                    <span className={s.muted}>From </span>
                    {full?.fromAddress || open.fromAddress || open.sender}
                  </span>
                  <span>
                    <span className={s.muted}>To </span>
                    {full?.toAddress || open.toAddress}
                  </span>
                  {full?.ccAddress && (
                    <span>
                      <span className={s.muted}>Cc </span>
                      {full.ccAddress}
                    </span>
                  )}
                  <span className={s.muted}>
                    {open.receivedTime ? new Date(open.receivedTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {matched && (
                    <Link className={s.chip} to={matched.crmId ? `/crm?edit=${encodeURIComponent(matched.crmId)}` : '/crm'}>
                      <Building2 size={11} /> {matched.companyName}
                    </Link>
                  )}
                  {open.hasAttachment && (
                    <span className={s.muted} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <Paperclip size={12} /> Has attachments (open them in Zoho Mail for now)
                    </span>
                  )}
                  {remote && !showImages && (
                    <button type="button" style={smallBtn} onClick={() => setShowImages(true)}>
                      <ImageIcon size={14} /> Show images
                    </button>
                  )}
                </div>
                {reading && <p className={s.muted}>Opening…</p>}
                {readError && (
                  <p role="alert" style={{ color: colors.danger, fontSize: 13, margin: 0 }}>
                    {readError}
                  </p>
                )}
                {full && (
                  <iframe
                    key={`${full.messageId}:${showImages ? 1 : 0}`}
                    title={`Email: ${full.subject}`}
                    className={s.frame}
                    // No scripts, no same origin, no forms. Links may open a new tab.
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                    srcDoc={frameDoc}
                  />
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
