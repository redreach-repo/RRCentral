import { useRef, useState } from 'react'
import Modal from '../Modal'
import { errorMessage } from '../../lib/errors'
import { parseFirefliesId, type FirefliesMeeting } from '../../lib/fireflies'
import { fetchFirefliesMeeting, meetingWhen, saveMeetingActivity } from '../../lib/firefliesStore'
import { parseFirefliesMeetingInput } from '../../lib/schemas/firefliesMeeting'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'
import { useToast } from '../../contexts/ToastContext'

const EXPORT_COLUMNS = [
  'kind',
  'index',
  'title',
  'date',
  'minutes',
  'participants',
  'overview',
  'action_item',
  'url',
] as const

/** Rebuild a meeting preview from the Fireflies export CSV shape. */
function meetingFromCsvRows(objects: Array<Record<string, string>>): FirefliesMeeting | null {
  if (!objects.length) return null
  const first = objects[0]
  const title = String(first.title || '').trim()
  if (!title) return null
  const url = String(first.url || '').trim()
  const id = parseFirefliesId(url) || `csv-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
  const participants = String(first.participants || '')
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 30)
  const actionItems = objects
    .map((row) => String(row.action_item || '').trim())
    .filter(Boolean)
    .slice(0, 50)
  const minutesRaw = Number(first.minutes)
  return {
    id,
    title: title.slice(0, 300),
    date: String(first.date || '').trim(),
    minutes: Number.isFinite(minutesRaw) ? Math.round(minutesRaw) : 0,
    url,
    participants,
    overview: String(first.overview || '').trim().slice(0, 6000),
    actionItems,
  }
}

function meetingExportRows(meeting: FirefliesMeeting): Array<Record<string, unknown>> {
  const actionRows = meeting.actionItems.map((item, i) => ({
    kind: 'action_item',
    index: i + 1,
    title: meeting.title,
    date: meeting.date,
    minutes: meeting.minutes,
    participants: meeting.participants.join('|'),
    overview: meeting.overview,
    action_item: item,
    url: meeting.url,
  }))
  if (actionRows.length > 0) return actionRows
  return [
    {
      kind: 'meeting',
      index: '',
      title: meeting.title,
      date: meeting.date,
      minutes: meeting.minutes,
      participants: meeting.participants.join('|'),
      overview: meeting.overview,
      action_item: '',
      url: meeting.url,
    },
  ]
}

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
  const { showToast } = useToast()
  const [input, setInput] = useState('')
  const [meeting, setMeeting] = useState<FirefliesMeeting | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  function close() {
    setInput('')
    setMeeting(null)
    setError('')
    setImporting(false)
    onClose()
  }

  async function fetchIt() {
    const parsed = parseFirefliesMeetingInput({ input })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError('')
    try {
      setMeeting(await fetchFirefliesMeeting(accountId, parsed.data.input))
    } catch (e) {
      setError(errorMessage(e, 'Could not read the meeting'))
    } finally {
      setBusy(false)
    }
  }

  async function importMeetingCsv(file: File) {
    setImporting(true)
    setError('')
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const next = meetingFromCsvRows(objects)
      if (!next) {
        showToast('No Fireflies meeting rows in CSV', 'error')
        return
      }
      setMeeting(next)
      const actionNote = next.actionItems.length
        ? ` · ${next.actionItems.length} action item(s)`
        : ''
      showToast(`Imported Fireflies meeting${actionNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Fireflies CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
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

  const importInput = (
    <input
      ref={importInputRef}
      type="file"
      accept=".csv,text/csv"
      style={{ display: 'none' }}
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) void importMeetingCsv(file)
      }}
    />
  )

  return (
    <Modal open={open} title="Add a Fireflies call" onClose={close} width={640}>
      {importInput}
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" style={buttonSecondaryStyle} onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={busy || importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
            <button type="button" style={buttonPrimaryStyle} disabled={busy || importing || !input.trim()} onClick={() => void fetchIt()}>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={busy || importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => {
                exportListCsv(`fireflies-${meeting.id}.csv`, [...EXPORT_COLUMNS], meetingExportRows(meeting))
                showToast('Fireflies meeting CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setMeeting(null)}>
              Back
            </button>
            <button type="button" style={buttonPrimaryStyle} disabled={busy || importing} onClick={() => void save()}>
              Add to timeline
            </button>
          </div>
        </>
      )}
      {error ? <p style={{ color: colors.danger, fontSize: 13, margin: '10px 0 0' }}>{error}</p> : null}
    </Modal>
  )
}
