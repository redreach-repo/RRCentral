import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import Modal from './Modal'
import type { AppUser, CrmEntry } from '../lib/types'
import { createTeamMeetingOnZoho, type ZohoSettings } from '../lib/zoho'
import { mergeAttendeeEmails } from '../lib/calendarAttendees'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'

type Props = {
  open: boolean
  onClose: () => void
  settings: ZohoSettings
  team: AppUser[]
  crmEntries: CrmEntry[]
  defaultCrmId?: string
  onCreated: () => void
}

export default function ScheduleMeetingModal({
  open,
  onClose,
  settings,
  team,
  crmEntries,
  defaultCrmId = '',
  onCreated,
}: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState('30')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [crmId, setCrmId] = useState(defaultCrmId)
  const [selectedTeam, setSelectedTeam] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeTeam = useMemo(
    () => team.filter((u) => u.active !== false && u.email),
    [team],
  )

  const selectedCrm = useMemo(
    () => crmEntries.find((c) => c.id === crmId) || null,
    [crmEntries, crmId],
  )

  function toggleTeamEmail(email: string) {
    setSelectedTeam((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    )
  }

  async function save() {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!date) {
      setError('Date is required')
      return
    }
    const attendeeEmails = mergeAttendeeEmails(selectedTeam)
    if (!attendeeEmails.length) {
      setError('Select at least one team member to invite')
      return
    }
    const [hourStr, minuteStr] = time.split(':')
    const startHour = Number(hourStr)
    const startMinute = Number(minuteStr) || 0
    if (!Number.isFinite(startHour)) {
      setError('Invalid start time')
      return
    }

    setSaving(true)
    setError('')
    try {
      await createTeamMeetingOnZoho(settings, {
        title: title.trim(),
        date,
        startHour,
        startMinute,
        durationMinutes: Number(duration) || 30,
        location,
        description: notes.trim(),
        attendeeEmails,
        crmCompany: selectedCrm?.company_name,
      })
      onCreated()
      onClose()
      setTitle('')
      setNotes('')
      setSelectedTeam([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create meeting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Schedule team meeting" onClose={onClose} width={640}>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>
        Creates an event on Zoho Calendar and emails invites to selected team members. They can
        accept on phone or desktop calendar apps linked to their @redreach.ae email.
      </p>
      <div style={formGridStyle}>
        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Title *</label>
          <input
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Client visit, internal sync…"
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Date *</label>
          <input
            style={inputStyle}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Start time</label>
          <input
            style={inputStyle}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Duration (minutes)</label>
          <input
            style={inputStyle}
            type="number"
            min={15}
            step={15}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Link to CRM company (optional)</label>
          <select style={inputStyle} value={crmId} onChange={(e) => setCrmId(e.target.value)}>
            <option value="">— None —</option>
            {crmEntries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Location</label>
          <input
            style={inputStyle}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Office, client site, video call…"
          />
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Notes</label>
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Invite team *</label>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 160,
            overflow: 'auto',
            padding: '8px 10px',
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
          }}
        >
          {activeTeam.length === 0 ? (
            <span style={{ color: colors.muted, fontSize: 13 }}>No active team members in Settings.</span>
          ) : (
            activeTeam.map((u) => (
              <label
                key={u.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={selectedTeam.includes(u.email)}
                  onChange={() => toggleTeamEmail(u.email)}
                />
                <span>
                  {u.name || u.email}{' '}
                  <span style={{ color: colors.muted2 }}>{u.email}</span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      {error ? (
        <p style={{ color: colors.danger, fontSize: 13, margin: '0 0 12px' }}>{error}</p>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" style={buttonPrimaryStyle} onClick={() => void save()} disabled={saving}>
          {saving ? 'Scheduling…' : 'Schedule & invite'}
        </button>
      </div>
    </Modal>
  )
}
