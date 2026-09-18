import { useEffect, useState, type FormEvent } from 'react'
import { addDays, format } from 'date-fns'
import Modal from './Modal'
import { NEXT_ACTIONS, PIPELINE_STAGES } from '../lib/config'
import type { CrmEntry } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'

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
  onClose: () => void
  onSave: (payload: LogTouchPayload) => Promise<void>
}

export default function CrmLogTouchModal({ open, entry, busy, onClose, onSave }: Props) {
  const [text, setText] = useState('')
  const [followDate, setFollowDate] = useState('')
  const [stage, setStage] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [clearDate, setClearDate] = useState(false)

  useEffect(() => {
    if (!open || !entry) return
    setText('')
    setFollowDate(entry.follow_up_date ? entry.follow_up_date.slice(0, 10) : '')
    setStage(entry.pipeline_stage || 'Lead')
    setNextAction(entry.next_action || '')
    setClearDate(false)
  }, [open, entry])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await onSave({
      text: text.trim(),
      follow_up_date: clearDate ? null : followDate || null,
      clearDate,
      pipeline_stage: stage,
      next_action: nextAction,
    })
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
              {PIPELINE_STAGES.map((s) => (
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
          <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={busy || !text.trim()}>
            {busy ? 'Saving…' : 'Save touch'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
