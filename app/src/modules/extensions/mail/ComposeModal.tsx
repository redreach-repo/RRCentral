import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import Modal from '../../../components/Modal'
import { errorMessage } from '../../../lib/errors'
import type { ComposeDraft } from '../../../lib/mailInbox/mailInbox'
import { MailSetupError, sendMail } from '../../../lib/mailInbox/mailInboxApi'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle } from '../../../lib/uiStyles'

type Props = {
  /** The starting fields; null closes the window. */
  draft: ComposeDraft | null
  /** The email being answered or forwarded. */
  original: { folderId: string; messageId: string; subject: string } | null
  fromAddress: string
  onClose: () => void
  onSent: (text: string) => void
  /** Zoho has not given the send permission yet: reconnect once. */
  onNeedsSendScope: () => void
}

const TITLES: Record<ComposeDraft['mode'], string> = {
  new: 'New email',
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward',
}

const label = { fontSize: 12, fontWeight: 600, display: 'grid', gap: 4 } as const

/**
 * Write an email. Nothing is sent until the person presses Send; closing the
 * window throws the draft away. Sends from their own mailbox address only.
 */
export default function ComposeModal({ draft, original, fromAddress, onClose, onSent, onNeedsSendScope }: Props) {
  const [d, setD] = useState<ComposeDraft | null>(draft)
  const [showBcc, setShowBcc] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setD(draft)
    setShowBcc(Boolean(draft?.bcc))
    setError('')
    setSending(false)
  }, [draft])

  if (!d) return null
  const set = (patch: Partial<ComposeDraft>) => setD((cur) => (cur ? { ...cur, ...patch } : cur))

  async function send() {
    if (!d || sending) return
    if (!d.to.trim()) {
      setError('Add at least one address in To.')
      return
    }
    setSending(true)
    setError('')
    try {
      await sendMail(d, d.mode !== 'new' && original ? original : undefined)
      onSent(`Sent to ${d.to.split(',')[0].trim()}${d.to.includes(',') || d.cc.trim() ? ' and others' : ''}.`)
    } catch (err) {
      if (err instanceof MailSetupError && err.needsSendScope) {
        onNeedsSendScope()
        return
      }
      setError(errorMessage(err, 'The email was not sent'))
      setSending(false)
    }
  }

  return (
    <Modal open onClose={() => !sending && onClose()} title={TITLES[d.mode]} width={640}>
      {/* Enter in a field never sends: only a press of the Send button does. */}
      <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, color: colors.muted, overflowWrap: 'anywhere' }}>
          From {fromAddress}
          {original && d.mode !== 'new' ? ` · ${d.mode === 'forward' ? 'forwarding' : 'answering'} “${original.subject}”, quoted below your text` : ''}
        </div>
        <label style={label}>
          To
          <input
            value={d.to}
            onChange={(e) => set({ to: e.target.value })}
            placeholder="name@company.com, another@company.com"
            style={inputStyle}
            autoFocus={!d.to}
            autoComplete="off"
          />
        </label>
        <label style={label}>
          Cc
          <input value={d.cc} onChange={(e) => set({ cc: e.target.value })} style={inputStyle} autoComplete="off" />
        </label>
        {showBcc ? (
          <label style={label}>
            Bcc
            <input value={d.bcc} onChange={(e) => set({ bcc: e.target.value })} style={inputStyle} autoComplete="off" />
          </label>
        ) : (
          <div>
            <button type="button" onClick={() => setShowBcc(true)} style={{ ...buttonSecondaryStyle, padding: '3px 8px', fontSize: 12 }}>
              Add Bcc
            </button>
          </div>
        )}
        <label style={label}>
          Subject
          <input value={d.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={300} style={inputStyle} />
        </label>
        <label style={label}>
          Message
          <textarea
            value={d.text}
            onChange={(e) => set({ text: e.target.value })}
            rows={10}
            autoFocus={Boolean(d.to)}
            style={{ ...inputStyle, minHeight: 180, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>
        {error && (
          <p role="alert" style={{ margin: 0, color: colors.danger, fontSize: 13 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={sending}>
            Discard
          </button>
          <button type="button" onClick={() => void send()} style={{ ...buttonPrimaryStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }} disabled={sending}>
            <Send size={15} /> {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
