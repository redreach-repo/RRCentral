import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import Modal from '../Modal'
import type { ProposedRequirement } from '../../lib/aiAssist'
import { runAi } from '../../lib/aiAssistStore'
import { errorMessage } from '../../lib/errors'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'

/**
 * Paste notes from a call; AI help suggests requirements; the team ticks the
 * ones to keep. Nothing is added until they press Add.
 */
export default function CallNotesModal({
  open,
  accountId,
  accountName,
  existing,
  asChangeRequests,
  onClose,
  onAdd,
}: {
  open: boolean
  accountId: string
  accountName: string
  existing: string[]
  asChangeRequests: boolean
  onClose: () => void
  onAdd: (items: ProposedRequirement[]) => Promise<void>
}) {
  const [notes, setNotes] = useState('')
  const [found, setFound] = useState<ProposedRequirement[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function close() {
    setNotes('')
    setFound(null)
    setPicked(new Set())
    setError('')
    onClose()
  }

  async function find() {
    setBusy(true)
    setError('')
    try {
      const r = await runAi(accountId, { feature: 'call_notes', accountName, notes, existing })
      setFound(r.requirements)
      setPicked(new Set(r.requirements.map((_, i) => i)))
    } catch (e) {
      setError(errorMessage(e, 'AI help is not available right now.'))
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    if (!found) return
    setBusy(true)
    try {
      await onAdd(found.filter((_, i) => picked.has(i)))
      close()
    } catch (e) {
      setError(errorMessage(e, 'Could not add the requirements'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Requirements from call notes" onClose={close} width={640}>
      {found === null ? (
        <>
          <label style={labelStyle} htmlFor="call-notes">
            Paste your notes from the call
          </label>
          <textarea
            id="call-notes"
            style={{ ...inputStyle, minHeight: 200, resize: 'vertical' }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Rough notes are fine. AI help picks out what the client wants the system to do."
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" style={buttonSecondaryStyle} onClick={close}>
              Cancel
            </button>
            <button type="button" style={buttonPrimaryStyle} disabled={busy || !notes.trim()} onClick={() => void find()}>
              <Sparkles size={14} /> {busy ? 'Reading the notes…' : 'Find requirements'}
            </button>
          </div>
        </>
      ) : found.length === 0 ? (
        <>
          <p style={{ margin: 0, color: colors.muted }}>No new requirements found in these notes.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setFound(null)}>
              Back to the notes
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 10px', color: colors.muted, fontSize: 13 }}>
            Untick anything that is wrong.{' '}
            {asChangeRequests ? 'Requirements are signed off, so these are added as change requests.' : ''}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {found.map((r, i) => (
              <li key={`${r.title}-${i}`}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={(e) =>
                      setPicked((p) => {
                        const next = new Set(p)
                        if (e.target.checked) next.add(i)
                        else next.delete(i)
                        return next
                      })
                    }
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontWeight: 600 }}>{r.title}</span>
                    {r.detail ? <span style={{ display: 'block', color: colors.muted, fontSize: 13 }}>{r.detail}</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setFound(null)}>
              Back to the notes
            </button>
            <button type="button" style={buttonPrimaryStyle} disabled={busy || picked.size === 0} onClick={() => void add()}>
              Add {picked.size} {picked.size === 1 ? 'requirement' : 'requirements'}
            </button>
          </div>
        </>
      )}
      {error ? <p style={{ color: colors.danger, fontSize: 13, margin: '10px 0 0' }}>{error}</p> : null}
    </Modal>
  )
}
