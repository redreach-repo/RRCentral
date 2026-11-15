import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addDays, format } from 'date-fns'
import Modal from './Modal'
import { useToast } from '../contexts/ToastContext'
import { NEXT_ACTIONS, PIPELINE_STAGES } from '../lib/config'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { parseCrmLogTouchForm } from '../lib/schemas/crmLogTouch'
import type { CrmEntry } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'

const EXPORT_COLUMNS = ['field', 'value'] as const

function parseYesNo(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'yes' || v === 'true' || v === '1' || v === 'y'
}

export type LogTouchPayload = {
  text: string
  follow_up_date: string | null
  clearDate: boolean
  pipeline_stage: string
  next_action: string
}

type Props = {
  open: boolean
  entry: CrmEntry | null
  busy?: boolean
  /** Tenant CRM stages; defaults to hardcoded PIPELINE_STAGES. */
  stages?: readonly string[]
  onClose: () => void
  onSave: (payload: LogTouchPayload) => Promise<void>
}

export default function CrmLogTouchModal({
  open,
  entry,
  busy,
  stages = PIPELINE_STAGES,
  onClose,
  onSave,
}: Props) {
  const { showToast } = useToast()
  const [text, setText] = useState('')
  const [followDate, setFollowDate] = useState('')
  const [stage, setStage] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [clearDate, setClearDate] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !entry) return
    setText('')
    setFollowDate(entry.follow_up_date ? entry.follow_up_date.slice(0, 10) : '')
    setStage(entry.pipeline_stage || 'Lead')
    setNextAction(entry.next_action || '')
    setClearDate(false)
  }, [open, entry])

  async function importLogTouchCsv(file: File) {
    setImporting(true)
    try {
      const textCsv = await file.text()
      const { headers, rows: csvRows } = parseCsv(textCsv)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      if (!objects.length) {
        showToast('No log-touch draft rows in CSV', 'error')
        return
      }

      const headerSet = new Set(headers.map((h) => h.trim().toLowerCase()))
      const isFieldValue = headerSet.has('field') && headerSet.has('value')

      let nextText = text
      let nextStage = stage
      let nextActionVal = nextAction
      let nextFollow = followDate
      let nextClear = clearDate
      let applied = 0

      const applyField = (fieldRaw: string, value: string) => {
        const field = fieldRaw.trim().toLowerCase()
        if (!field || field === 'company') return
        if (field === 'note' || field === 'text') {
          nextText = value
          applied += 1
        } else if (field === 'stage' || field === 'pipeline_stage') {
          if (!value || stages.includes(value)) {
            nextStage = value || nextStage
            applied += 1
          }
        } else if (field === 'next_action') {
          nextActionVal = value
          applied += 1
        } else if (field === 'follow_up_date') {
          if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            nextFollow = value
            applied += 1
          }
        } else if (field === 'clear_follow_up' || field === 'cleardate') {
          nextClear = parseYesNo(value)
          applied += 1
        }
      }

      if (isFieldValue) {
        for (const row of objects) {
          applyField(String(row.field || row.key || ''), String(row.value ?? '').trim())
        }
      } else {
        const row =
          objects.find(
            (r) =>
              String(r.note || r.text || r.stage || r.pipeline_stage || r.next_action || '').trim(),
          ) || objects[0]
        if (row) {
          if (row.note != null || row.text != null) applyField('note', String(row.note ?? row.text ?? '').trim())
          if (row.stage != null || row.pipeline_stage != null)
            applyField('stage', String(row.stage ?? row.pipeline_stage ?? '').trim())
          if (row.next_action != null) applyField('next_action', String(row.next_action ?? '').trim())
          if (row.follow_up_date != null) applyField('follow_up_date', String(row.follow_up_date ?? '').trim())
          if (row.clear_follow_up != null || row.clearDate != null)
            applyField('clear_follow_up', String(row.clear_follow_up ?? row.clearDate ?? '').trim())
        }
      }

      if (!applied) {
        showToast('No log-touch draft fields to import in CSV', 'error')
        return
      }

      setText(nextText)
      setStage(nextStage)
      setNextAction(nextActionVal)
      setFollowDate(nextFollow)
      setClearDate(nextClear)
      showToast(`Imported ${applied} log-touch draft field(s)`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Log-touch CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = parseCrmLogTouchForm({
      text,
      follow_up_date: followDate,
      clearDate,
      pipeline_stage: stage,
      next_action: nextAction,
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    await onSave(parsed.data)
  }

  return (
    <Modal
      open={open && !!entry}
      title={entry ? `Log touch — ${entry.company_name}` : 'Log touch'}
      onClose={onClose}
      width={520}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={fieldStyle}>
          <label style={labelStyle}>What happened? *</label>
          <textarea
            style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Called — left voicemail / Sent quote / Meeting notes…"
            required
            autoFocus
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
            gap: 12,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Stage</label>
            <select style={inputStyle} value={stage} onChange={(e) => setStage(e.target.value)}>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Next action</label>
            <select
              style={inputStyle}
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              disabled={clearDate}
            >
              <option value="">—</option>
              {NEXT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Next follow-up</label>
            <input
              type="date"
              style={inputStyle}
              value={followDate}
              disabled={clearDate}
              onChange={(e) => setFollowDate(e.target.value)}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {[1, 3, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 11 }}
                  disabled={clearDate}
                  onClick={() => {
                    setClearDate(false)
                    setFollowDate(format(addDays(new Date(), d), 'yyyy-MM-dd'))
                  }}
                >
                  +{d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: colors.muted,
            marginBottom: 16,
          }}
        >
          <input
            type="checkbox"
            checked={clearDate}
            onChange={(e) => setClearDate(e.target.checked)}
          />
          Clear follow-up date (park this deal)
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importLogTouchCsv(file)
            }}
          />
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
            disabled={busy || importing}
            onClick={() => {
              exportListCsv(
                'crm-log-touch.csv',
                [...EXPORT_COLUMNS],
                [
                  { field: 'company', value: entry?.company_name || '' },
                  { field: 'note', value: text },
                  { field: 'stage', value: stage },
                  { field: 'next_action', value: nextAction },
                  { field: 'follow_up_date', value: clearDate ? '' : followDate },
                  { field: 'clear_follow_up', value: clearDate ? 'yes' : 'no' },
                ],
              )
              showToast('Log-touch draft CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={busy || importing}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={busy || importing || !text.trim()}>
            {busy ? 'Saving…' : 'Save touch'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
