import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ExternalLink, Plus } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import {
  DEFAULT_SESSION_TOPICS,
  SESSION_KINDS,
  SESSION_TOPICS_SETTING,
  leftToCover,
  notStarted,
  sessionKindLabel,
  sessionProblem,
  type SessionDraft,
} from '../../lib/ctrmSessions'
import { listSessions, markFollowUpDone, saveSession } from '../../lib/ctrmSessionsStore'
import { errorMessage } from '../../lib/errors'
import { parseSettingsList } from '../../lib/fitSheet'
import type { Account, CtrmSession, CtrmSessionKind } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, fieldStyle, inputStyle, labelStyle, sectionTitleStyle, selectStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }
const muted = { color: colors.muted, fontSize: 13 }
const day = (d: string) => format(parseISO(d), 'd MMM yyyy')

const blank = (): SessionDraft => ({
  kind: 'demo',
  session_date: format(new Date(), 'yyyy-MM-dd'),
  attendees: '',
  topics_covered: [],
  topics_left: [],
  recording_url: '',
  follow_up_due: null,
  notes: '',
})

/**
 * Demos, trainings, workshops and reviews with a CTRM Next account, with
 * what is left to cover across all of them.
 */
export default function SessionsCard({ account, editable, author }: { account: Account; editable: boolean; author: { appUserId: string | null; email: string } }) {
  const { showToast } = useToast()
  const { settings } = useSettings()
  const topics = parseSettingsList(settings[SESSION_TOPICS_SETTING], DEFAULT_SESSION_TOPICS)
  const [rows, setRows] = useState<CtrmSession[] | null>(null)
  const [editing, setEditing] = useState<{ session: CtrmSession | null; draft: SessionDraft } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows((await listSessions(account.id)).rows)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load sessions'), 'error')
      setRows([])
    }
  }, [account.id, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!editing) return
    const problem = sessionProblem(editing.draft)
    if (problem) return showToast(problem, 'error')
    setSaving(true)
    try {
      await saveSession(account.id, editing.draft, editing.session, author)
      showToast('Session saved', 'success')
      setEditing(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the session'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function done(s: CtrmSession) {
    try {
      await markFollowUpDone(s, author)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save that'), 'error')
    }
  }

  const left = leftToCover(rows || [])
  const untouched = notStarted(rows || [], topics)
  const today = format(new Date(), 'yyyy-MM-dd')

  function topicBoxes(field: 'topics_covered' | 'topics_left', label: string) {
    if (!editing) return null
    const d = editing.draft
    const other = field === 'topics_covered' ? 'topics_left' : 'topics_covered'
    const choices = [...new Set([...topics, ...d[field]])]
    return (
      <div>
        <div style={labelStyle}>{label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 14 }}>
          {choices.map((t) => (
            <label key={t} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={d[field].includes(t)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    draft: {
                      ...d,
                      [field]: e.target.checked ? [...d[field], t] : d[field].filter((x) => x !== t),
                      // A topic is either covered or left, never both.
                      [other]: e.target.checked ? d[other].filter((x) => x !== t) : d[other],
                    },
                  })
                }
              />
              {t}
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Sessions</h2>
        {editable && !editing ? (
          <button type="button" style={smallBtn} onClick={() => setEditing({ session: null, draft: blank() })}>
            <Plus size={14} /> Log a session
          </button>
        ) : null}
      </div>

      {rows && rows.length ? (
        <div style={{ margin: '10px 0', fontSize: 14 }}>
          <div>
            <strong>Left to cover:</strong> {left.length ? left.join(', ') : 'nothing marked left'}
          </div>
          {untouched.length ? <div style={muted}>Not covered or planned yet: {untouched.join(', ')}</div> : null}
        </div>
      ) : null}

      {editing ? (
        <div style={{ display: 'grid', gap: 12, margin: '10px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="ses-kind">
                Type
              </label>
              <select
                id="ses-kind"
                style={selectStyle}
                value={editing.draft.kind}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, kind: e.target.value as CtrmSessionKind } })}
              >
                {SESSION_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="ses-date">
                Date
              </label>
              <input
                id="ses-date"
                type="date"
                style={inputStyle}
                value={editing.draft.session_date}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, session_date: e.target.value } })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="ses-follow">
                Follow up due
              </label>
              <input
                id="ses-follow"
                type="date"
                style={inputStyle}
                value={editing.draft.follow_up_due ?? ''}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, follow_up_due: e.target.value || null } })}
              />
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="ses-attendees">
              Attendees
            </label>
            <input
              id="ses-attendees"
              style={inputStyle}
              placeholder="Names, comma separated"
              value={editing.draft.attendees}
              onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, attendees: e.target.value } })}
            />
          </div>
          {topicBoxes('topics_covered', 'Topics covered')}
          {topicBoxes('topics_left', 'Topics left')}
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="ses-recording">
              Recording link
            </label>
            <input
              id="ses-recording"
              type="url"
              style={inputStyle}
              placeholder="https://"
              value={editing.draft.recording_url}
              onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, recording_url: e.target.value } })}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="ses-notes">
              Notes
            </label>
            <textarea
              id="ses-notes"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="What they asked, what to prepare next time. No trade data."
              value={editing.draft.notes}
              onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, notes: e.target.value } })}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save session'}
            </button>
            <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!rows ? <p style={muted}>Loading…</p> : null}
      {rows && !rows.length && !editing ? <p style={muted}>No sessions yet. Log each demo and training so you know what is left to cover.</p> : null}
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>
        {(rows || []).map((s) => {
          const due = !s.follow_up_done && s.follow_up_due && s.follow_up_due <= today
          return (
            <li key={s.id} style={{ border: `1px solid ${due ? colors.danger : colors.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>
                  {sessionKindLabel(s.kind)}, {day(s.session_date)}
                </strong>
                <span style={{ display: 'flex', gap: 8 }}>
                  {s.recording_url ? (
                    <a href={s.recording_url} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none' }}>
                      <ExternalLink size={13} /> Recording
                    </a>
                  ) : null}
                  {editable ? (
                    <button type="button" style={smallBtn} onClick={() => setEditing({ session: s, draft: { ...s } })}>
                      Edit
                    </button>
                  ) : null}
                </span>
              </div>
              {s.attendees ? <div style={muted}>With {s.attendees}</div> : null}
              {s.topics_covered.length ? <div>Covered: {s.topics_covered.join(', ')}</div> : null}
              {s.topics_left.length ? <div>Left: {s.topics_left.join(', ')}</div> : null}
              {s.notes ? <div style={{ ...muted, whiteSpace: 'pre-wrap' }}>{s.notes}</div> : null}
              {s.follow_up_due ? (
                <div style={{ ...muted, color: due ? colors.danger : colors.muted, display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  {s.follow_up_done ? `Follow up done (was due ${day(s.follow_up_due)})` : `Follow up due ${day(s.follow_up_due)}`}
                  {editable && !s.follow_up_done ? (
                    <button type="button" style={smallBtn} onClick={() => void done(s)}>
                      Mark done
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
