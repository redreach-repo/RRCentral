import { useState } from 'react'
import Modal from '../Modal'
import { errorMessage } from '../../lib/errors'
import type { FirefliesMeeting } from '../../lib/fireflies'
import { fetchFirefliesMeeting, meetingWhen, saveMeetingActivity } from '../../lib/firefliesStore'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'

/**
 * Paste a Fireflies meeting link or ID, check what came back, and keep it as
 * a Meeting on the timeline. For a build client the notes go on to AI help.
 */
export default function FirefliesCallModal({
  open,
  accountId,
  isBuildClient,
  author,
  onClose,
  onSaved,
}: {
  open: boolean
  accountId: string
  isBuildClient: boolean
  author: { appUserId: string | null; email: string }
  onClose: () => void
  onSaved: (meeting: FirefliesMeeting) => void
}) {
  const [input, setInput] = useState('')
  const [meeting, setMeeting] = useState<FirefliesMeeting | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function close() {
    setInput('')
    setMeeting(null)
    setError('')
    onClose()
  }

  async function fetchIt() {
    setBusy(true)
    setError('')
    try {
      setMeeting(await fetchFirefliesMeeting(accountId, input))
    } catch (e) {
      setError(errorMessage(e, 'Could not read the meeting'))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!meeting) return
    setBusy(true)
    setError('')
    try {
      await saveMeetingActivity(accountId, meeting, author)
      onSaved(meeting)
      close()
    } catch (e) {
      setError(errorMessage(e, 'Could not add the meeting'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Add a Fireflies call" onClose={close} width={640}>
      {!meeting ? (
        <>
          <label style={labelStyle} htmlFor="ff-meeting">
            The meeting's Fireflies link or ID
          </label>
          <input
            id="ff-meeting"
            style={inputStyle}
            value={input}
            placeholder="https://app.fireflies.ai/view/…"
            onChange={(e) => setInput(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" style={buttonSecondaryStyle} onClick={close}>
              Cancel
            </button>
            <button type="button" style={buttonPrimaryStyle} disabled={busy || !input.trim()} onClick={() => void fetchIt()}>
              {busy ? 'Reading from Fireflies…' : 'Get the summary'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{meeting.title}</p>
          <p style={{ margin: '0 0 10px', color: colors.muted, fontSize: 13 }}>
            {meetingWhen(meeting)}
            {meeting.minutes ? `, ${meeting.minutes} min` : ''}
            {meeting.participants.length ? `, with ${meeting.participants.join(', ')}` : ''}
          </p>
          {meeting.overview ? <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>{meeting.overview}</p> : null}
          {meeting.actionItems.length ? (
            <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 14 }}>
              {meeting.actionItems.map((a, i) => (
                <li key={`${a}-${i}`}>{a}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: colors.muted, fontSize: 13 }}>No action items in this meeting.</p>
          )}
          <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>
            {isBuildClient
              ? 'After adding it, AI help reads it for requirements; you tick the ones to keep.'
              : 'It is added to the timeline as a Meeting.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setMeeting(null)}>
              Back
            </button>
            <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void save()}>
              Add to timeline
            </button>
          </div>
        </>
      )}
      {error ? <p style={{ color: colors.danger, fontSize: 13, margin: '10px 0 0' }}>{error}</p> : null}
    </Modal>
  )
}
