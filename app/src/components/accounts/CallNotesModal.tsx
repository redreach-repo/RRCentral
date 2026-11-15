import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import Modal from '../Modal'
import type { ProposedRequirement } from '../../lib/aiAssist'
import { runAi } from '../../lib/aiAssistStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { parseCallNotesForm } from '../../lib/schemas/callNotes'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'
import { useToast } from '../../contexts/ToastContext'

const EXPORT_COLUMNS = ['title', 'detail', 'picked', 'as_change_request'] as const

function parseYesNo(raw: string, defaultYes = true): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return defaultYes
  return v === 'yes' || v === 'true' || v === '1' || v === 'y'
}

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
  initialNotes = '',
  onClose,
  onAdd,
}: {
  open: boolean
  accountId: string
  accountName: string
  existing: string[]
  asChangeRequests: boolean
  /** Notes to start from, such as a Fireflies call. AI help reads them straight away. */
  initialNotes?: string
  onClose: () => void
  onAdd: (items: ProposedRequirement[]) => Promise<void>
}) {
  const { showToast } = useToast()
  const [notes, setNotes] = useState('')
  const [found, setFound] = useState<ProposedRequirement[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  function close() {
    setNotes('')
    setFound(null)
    setPicked(new Set())
    setError('')
    onClose()
  }

  useEffect(() => {
    if (open && initialNotes.trim()) {
      setNotes(initialNotes)
      void find(initialNotes)
    }
    // Only when opened with new notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialNotes])

  async function find(text: string = notes) {
    const parsed = parseCallNotesForm({ notes: text })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await runAi(accountId, {
        feature: 'call_notes',
        accountName,
        notes: parsed.data.notes,
        existing,
      })
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

  async function importCallNotesCsv(file: File) {
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
      const existingKeys = new Set(existing.map((t) => t.trim().toLowerCase()).filter(Boolean))
      const next: ProposedRequirement[] = []
      const nextPicked = new Set<number>()
      const seen = new Set<string>()
      let skipped = 0

      for (const row of objects) {
        const title = String(row.title || '').trim()
        const detail = String(row.detail || '').trim()
        if (!title) {
          skipped += 1
          continue
        }
        const key = title.toLowerCase()
        if (seen.has(key) || existingKeys.has(key)) {
          skipped += 1
          continue
        }
        seen.add(key)
        const i = next.length
        next.push({ title, detail })
        if (parseYesNo(String(row.picked ?? ''), true)) {
          nextPicked.add(i)
        }
      }

      if (!next.length) {
        showToast('No call-notes requirements in CSV', 'error')
        return
      }

      const toPersist = next.filter((_, i) => nextPicked.has(i))
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''

      // Prefer persist: add picked rows via onAdd when any are ticked.
      if (toPersist.length) {
        await onAdd(toPersist)
        showToast(`Imported ${toPersist.length} requirement(s) from call-notes CSV${skipNote}`, 'success')
        close()
        return
      }

      setFound(next)
      setPicked(new Set())
      showToast(`Loaded ${next.length} requirement(s) for review${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Call-notes CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const importControls = (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importCallNotesCsv(file)
        }}
      />
      <button
        type="button"
        style={buttonSecondaryStyle}
        disabled={importing || busy}
        onClick={() => importInputRef.current?.click()}
      >
        {importing ? 'Importing…' : 'Import CSV'}
      </button>
    </>
  )

  return (
    <Modal open={open} title="Requirements from call notes" onClose={close} width={640}>
      {found === null ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {importControls}
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {importControls}
            <button type="button" style={buttonSecondaryStyle} onClick={() => setFound(null)}>
              Back to the notes
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, color: colors.muted, fontSize: 13 }}>
              Untick anything that is wrong.{' '}
              {asChangeRequests ? 'Requirements are signed off, so these are added as change requests.' : ''}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {importControls}
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  exportListCsv(
                    `call-notes-requirements-${accountName || accountId}.csv`,
                    [...EXPORT_COLUMNS],
                    found.map((r, i) => ({
                      title: r.title,
                      detail: r.detail,
                      picked: picked.has(i) ? 'yes' : 'no',
                      as_change_request: asChangeRequests ? 'yes' : 'no',
                    })),
                  )
                  showToast('Call-notes requirements CSV downloaded', 'success')
                }}
              >
                Export CSV
              </button>
            </div>
          </div>
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
