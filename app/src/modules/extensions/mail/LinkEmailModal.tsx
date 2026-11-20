import { useEffect, useRef, useState } from 'react'
import { Building2, Link2 } from 'lucide-react'
import Modal from '../../../components/Modal'
import { errorMessage } from '../../../lib/errors'
import {
  MAIL_LINK_TYPES,
  linkMail,
  searchLinkTargets,
  type LinkTarget,
  type MailLinkType,
} from '../../../lib/mailInbox/mailLinks'
import { buttonSecondaryStyle, colors, inputStyle } from '../../../lib/uiStyles'

type Props = {
  open: boolean
  onClose: () => void
  onLinked: () => void
  folderId: string
  messageId: string
  subject: string
  /** Shown first: the CRM company (and its client) matched from the email's addresses. */
  suggestions: LinkTarget[]
  /** "type:id" of records this email is already linked to. */
  linked: Set<string>
}

const smallBtn = { ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }

/**
 * Link one email to a client, CRM company or deal, quotation or invoice. Only
 * its header (subject, from, to, date) goes on the record; the body stays in
 * your own mailbox.
 */
export default function LinkEmailModal({ open, onClose, onLinked, folderId, messageId, subject, suggestions, linked }: Props) {
  const [type, setType] = useState<MailLinkType>('account')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<LinkTarget[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    setQ('')
    setResults([])
    setError('')
  }, [open, messageId])

  useEffect(() => {
    if (!open) return
    const text = q.trim()
    if (text.length < 2) {
      setResults([])
      return
    }
    const mine = ++seq.current
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchLinkTargets(type, text)
        .then((rows) => {
          if (mine === seq.current) setResults(rows)
        })
        .catch((e) => {
          if (mine === seq.current) setError(errorMessage(e, 'Search failed'))
        })
        .finally(() => {
          if (mine === seq.current) setSearching(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [q, type, open])

  async function link(t: LinkTarget) {
    setBusy(`${t.type}:${t.id}`)
    setError('')
    try {
      await linkMail({ folderId, messageId, targetType: t.type, targetId: t.id })
      onLinked()
    } catch (e) {
      setError(errorMessage(e, 'Could not link the email'))
    } finally {
      setBusy('')
    }
  }

  function row(t: LinkTarget) {
    const key = `${t.type}:${t.id}`
    const done = linked.has(key)
    return (
      <li
        key={key}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, overflowWrap: 'anywhere' }}>{t.label}</span>
          <span style={{ display: 'block', fontSize: 12, color: colors.muted }}>
            {MAIL_LINK_TYPES.find((x) => x.id === t.type)?.label}
            {t.detail ? ` · ${t.detail}` : ''}
          </span>
        </span>
        <button type="button" style={smallBtn} disabled={done || busy !== ''} onClick={() => void link(t)}>
          {done ? 'Linked' : busy === key ? 'Linking…' : (
            <>
              <Link2 size={13} /> Link
            </>
          )}
        </button>
      </li>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Link this email" width={560}>
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: colors.muted, overflowWrap: 'anywhere' }}>
          “{subject}”. The record will show the subject, sender, recipients and date. The email itself stays in your mailbox.
        </p>

        {suggestions.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
              <Building2 size={13} /> Matched from the email address
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{suggestions.map(row)}</ul>
          </div>
        )}

        <div role="radiogroup" aria-label="Link to" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MAIL_LINK_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={type === t.id}
              style={{
                ...smallBtn,
                ...(type === t.id ? { borderColor: colors.accent, color: colors.text, fontWeight: 600 } : {}),
              }}
              onClick={() => {
                setType(t.id)
                setResults([])
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={type === 'quotation' || type === 'invoice' ? 'Number or client name' : 'Company name'}
          aria-label="Search records"
          style={inputStyle}
          autoFocus
        />
        {error && (
          <p role="alert" style={{ margin: 0, color: colors.danger, fontSize: 13 }}>
            {error}
          </p>
        )}
        {searching && <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Searching…</p>}
        {!searching && q.trim().length >= 2 && results.length === 0 && !error && (
          <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Nothing found.</p>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 320, overflowY: 'auto' }}>{results.map(row)}</ul>
      </div>
    </Modal>
  )
}
