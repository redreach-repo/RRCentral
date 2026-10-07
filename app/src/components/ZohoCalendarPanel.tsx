import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, isBefore, parseISO, startOfDay } from 'date-fns'
import { CalendarClock, ExternalLink, Loader2, Plus, RefreshCw } from 'lucide-react'
import type { AppUser, CrmEntry } from '../lib/types'
import { useSettings } from '../contexts/SettingsContext'
import { db } from '../lib/db'
import {
  isZohoCalendarEnabled,
  isZohoConfigured,
  listZohoCalendarEvents,
  zohoCalendarWebUrl,
} from '../lib/zoho'
import { enrichCalendarEvents, type CalendarEventRow } from '../lib/zohoCalendarMatch'
import ScheduleMeetingModal from './ScheduleMeetingModal'
import EmptyState from './EmptyState'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  sectionTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'

type Props = {
  crmEntries: CrmEntry[]
}

function formatEventWhen(row: CalendarEventRow): string {
  try {
    const start = parseISO(row.startAt.slice(0, 19))
    const end = row.endAt ? parseISO(row.endAt.slice(0, 19)) : null
    const day = format(start, 'EEE d MMM')
    if (row.isAllDay) return `${day} · All day`
    const time = format(start, 'HH:mm')
    const endTime = end ? format(end, 'HH:mm') : ''
    return endTime ? `${day} · ${time}–${endTime}` : `${day} · ${time}`
  } catch {
    return row.startAt || '—'
  }
}

export default function ZohoCalendarPanel({ crmEntries }: Props) {
  const { settings } = useSettings()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<CalendarEventRow[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [daysAhead, setDaysAhead] = useState(14)

  const enabled = isZohoCalendarEnabled(settings)
  const configured = isZohoConfigured(settings)

  const loadTeam = useCallback(async () => {
    const { data, error: teamErr } = await db
      .from('app_users')
      .select('*')
      .eq('active', true)
      .order('name')
    if (!teamErr && data) setTeam(data as AppUser[])
  }, [])

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError('')
    try {
      const start = startOfDay(new Date())
      const end = addDays(start, daysAhead)
      const events = await listZohoCalendarEvents(settings, { start, end })
      setRows(enrichCalendarEvents(events, crmEntries))
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Could not load Zoho Calendar')
    } finally {
      setLoading(false)
    }
  }, [enabled, settings, crmEntries, daysAhead])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  const upcoming = useMemo(() => {
    const today = startOfDay(new Date())
    return rows.filter((r) => {
      try {
        return !isBefore(parseISO(r.startAt.slice(0, 10)), today)
      } catch {
        return true
      }
    })
  }, [rows])

  if (!configured) {
    return (
      <div style={cardStyle}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarClock size={18} /> Team calendar
        </h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
          Add Zoho credentials in Settings to show meetings from Zoho Calendar here.
        </p>
      </div>
    )
  }

  if (!enabled) {
    return (
      <div style={cardStyle}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarClock size={18} /> Team calendar
        </h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
          Set <strong style={{ color: colors.text }}>Calendar sync</strong> to <code>yes</code> in
          Settings → Zoho to pull meetings onto the dashboard.
        </p>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h2 style={{ ...sectionTitleStyle, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarClock size={18} /> Team calendar
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select
            style={{ ...buttonSecondaryStyle, padding: '6px 10px' }}
            value={daysAhead}
            onChange={(e) => setDaysAhead(Number(e.target.value))}
          >
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={31}>Next 31 days</option>
          </select>
          <a
            href={zohoCalendarWebUrl(settings)}
            target="_blank"
            rel="noreferrer"
            style={{ ...buttonSecondaryStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ExternalLink size={14} /> Open Zoho Calendar
          </a>
          <button type="button" style={buttonSecondaryStyle} disabled={loading} onClick={() => void load()}>
            {loading ? <Loader2 size={14} /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button type="button" style={buttonPrimaryStyle} onClick={() => setScheduleOpen(true)}>
            <Plus size={14} /> Schedule meeting
          </button>
        </div>
      </div>

      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>
        Meetings from Zoho Calendar (including ones you add in Zoho) appear here. Schedule from CRM
        to invite team members — Zoho emails them so it lands on their phone calendar when accepted.
      </p>

      {error ? (
        <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>
      ) : loading && rows.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13 }}>Loading calendar…</p>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title="No upcoming meetings"
          subtitle="Add events in Zoho Calendar or schedule a team meeting here."
          actionLabel="Schedule meeting"
          onAction={() => setScheduleOpen(true)}
        />
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Meeting</th>
                <th style={thStyle}>CRM</th>
                <th style={thStyle}>Attendees</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row) => (
                <tr key={row.uid}>
                  <td style={tdStyle}>{formatEventWhen(row)}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{row.title}</div>
                    {row.description ? (
                      <div style={{ fontSize: 11, color: colors.muted2 }}>{row.description.slice(0, 80)}</div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    {row.crm ? (
                      <Link
                        to={`/crm?edit=${row.crm.id}`}
                        style={{ color: colors.accent, textDecoration: 'none' }}
                      >
                        {row.crm.company_name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={tdStyle}>
                    {row.attendees.length ? (
                      <span style={{ fontSize: 12 }}>
                        {row.attendees.map((a) => a.email.split('@')[0]).join(', ')}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ScheduleMeetingModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        settings={settings}
        team={team}
        crmEntries={crmEntries}
        onCreated={() => void load()}
      />
    </div>
  )
}
