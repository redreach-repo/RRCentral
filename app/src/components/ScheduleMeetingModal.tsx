import { useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import Modal from './Modal'
import type { AppUser, CrmEntry } from '../lib/types'
import { getCalendarProvider, type ProviderSettings } from '../lib/mailCalendar'
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
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { parseScheduleMeetingForm } from '../lib/schemas/scheduleMeeting'
import { useToast } from '../contexts/ToastContext'

type Props = {
  open: boolean
  onClose: () => void
  settings: ProviderSettings
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
  const { showToast } = useToast()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState('30')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [crmId, setCrmId] = useState(defaultCrmId)
  const [selectedTeam, setSelectedTeam] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

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
      if (!objects.length) {
        showToast('No meeting draft rows in CSV', 'error')
        return
      }

      let applied = 0
      const invitees: string[] = []
      const activeEmails = new Set(
        team.filter((u) => u.active !== false && u.email).map((u) => u.email.toLowerCase()),
      )

      for (const row of objects) {
        const field = String(row.field || row.key || '').trim().toLowerCase()
        const value = String(row.value ?? '').trim()
        if (!field) continue
        if (field === 'title') {
          setTitle(value)
          applied += 1
        } else if (field === 'date') {
          setDate(value)
          applied += 1
        } else if (field === 'time') {
          setTime(value)
          applied += 1
        } else if (field === 'duration_minutes' || field === 'duration') {
          setDuration(value)
          applied += 1
        } else if (field === 'location') {
          setLocation(value)
          applied += 1
        } else if (field === 'notes') {
          setNotes(value)
          applied += 1
        } else if (field === 'crm_id') {
          if (!value || crmEntries.some((c) => c.id === value)) {
            setCrmId(value)
            applied += 1
          }
        } else if (field === 'crm_company') {
          if (!value) {
            setCrmId('')
            applied += 1
          } else {
            const match = crmEntries.find(
              (c) => c.company_name.toLowerCase() === value.toLowerCase(),
            )
            if (match) {
              setCrmId(match.id)
              applied += 1
            }
          }
        } else if (field.startsWith('invitee')) {
          if (value && activeEmails.has(value.toLowerCase())) {
            invitees.push(
              team.find((u) => u.email.toLowerCase() === value.toLowerCase())?.email || value,
            )
            applied += 1
          } else if (value) {
            invitees.push(value)
            applied += 1
          }
        }
      }

      if (invitees.length) {
        const unique = [...new Set(invitees)]
        setSelectedTeam(unique)
      }

      if (!applied) {
        showToast('No meeting draft fields to import in CSV', 'error')
        return
      }
      showToast(`Imported ${applied} meeting draft field(s)`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Meeting draft CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function save() {
    const attendeeEmails = mergeAttendeeEmails(selectedTeam)
    const parsed = parseScheduleMeetingForm({
      title,
      date,
      time,
      duration,
      location,
      notes,
      attendeeEmails,
    })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    setSaving(true)
    setError('')
    try {
      await getCalendarProvider(settings).createTeamMeeting(settings, {
        title: parsed.data.title,
        date: parsed.data.date,
        startHour: parsed.data.startHour,
        startMinute: parsed.data.startMinute,
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location,
        description: parsed.data.description,
        attendeeEmails: parsed.data.attendeeEmails,
        crmCompany: selectedCrm?.company_name,
      })
      onCreated()
      onClose()
      setTitle('')
      setNotes('')
      setSelectedTeam([])
    } catch (e) {
      setError(errorMessage(e, 'Could not create meeting'))
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
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
        <button
          type="button"
          style={buttonSecondaryStyle}
          disabled={saving || importing}
          onClick={() => importInputRef.current?.click()}
        >
          {importing ? 'Importing…' : 'Import CSV'}
        </button>
        <button
          type="button"
          style={buttonSecondaryStyle}
          disabled={saving || importing}
          onClick={() => {
            const crm = crmEntries.find((c) => c.id === crmId)
            exportListCsv(
              'schedule-meeting.csv',
              ['field', 'value'],
              [
                { field: 'title', value: title },
                { field: 'date', value: date },
                { field: 'time', value: time },
                { field: 'duration_minutes', value: duration },
                { field: 'location', value: location },
                { field: 'notes', value: notes },
                { field: 'crm_company', value: crm?.company_name || '' },
                { field: 'crm_id', value: crmId },
                ...selectedTeam.map((email, i) => ({ field: `invitee_${i + 1}`, value: email })),
              ],
            )
            showToast('Meeting draft CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
        <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={saving || importing}>
          Cancel
        </button>
        <button
          type="button"
          style={buttonPrimaryStyle}
          onClick={() => void save()}
          disabled={saving || importing}
        >
          {saving ? 'Scheduling…' : 'Schedule & invite'}
        </button>
      </div>
    </Modal>
  )
}
