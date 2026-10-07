import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { CalendarClock, ExternalLink, Loader2, Plus, RefreshCw } from 'lucide-react'
import type { AppUser, CrmEntry } from '../lib/types'
import { useSettings } from '../contexts/SettingsContext'
import { db } from '../lib/db'
import { hydrateContacts, primaryContact } from '../lib/contacts'
import {
  isZohoCalendarEnabled,
  isZohoConfigured,
  listZohoCalendarEvents,
  zohoCalendarWebUrl,
} from '../lib/zoho'
import { enrichCalendarEvents, type CalendarEventRow } from '../lib/zohoCalendarMatch'
import { buildScheduleRows, type ScheduleKind, type ScheduleRow } from '../lib/scheduleBoard'
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

type Filter = 'all' | 'follow_up' | 'meeting'

function formatWhen(row: ScheduleRow): string {
  try {
    if (row.kind === 'follow_up') {
      const d = parseISO(row.whenLabel.slice(0, 10))
      return format(d, 'EEE d MMM')
    }
    const start = parseISO(row.whenLabel.slice(0, 19))
    return `${format(start, 'EEE d MMM')} · ${format(start, 'HH:mm')}`
  } catch {
    return row.whenLabel || '—'
  }
}

function kindBadge(kind: ScheduleKind): { label: string; color: string } {
  if (kind === 'follow_up') return { label: 'Follow-up', color: '#fb923c' }
  if (kind === 'meeting') return { label: 'Meeting', color: '#60a5fa' }
  return { label: 'Calendar', color: '#a78bfa' }
}

export default function ZohoCalendarPanel({ crmEntries }: Props) {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRow[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [daysAhead, setDaysAhead] = useState(14)
  const [filter, setFilter] = useState<Filter>('all')

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
    if (!enabled) {
      setCalendarEvents([])
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const start = startOfDay(new Date())
      const end = addDays(start, daysAhead)
      const events = await listZohoCalendarEvents(settings, { start, end })
      setCalendarEvents(enrichCalendarEvents(events, crmEntries))
    } catch (e) {
      setCalendarEvents([])
      setError(e instanceof Error ? e.message : 'Could not load Zoho Calendar')
    } finally {
      setLoading(false)
    }
  }, [enabled, settings, crmEntries, daysAhead])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  useEffect(() => {
    void load()
  }, [load])

  const scheduleRows = useMemo(
    () =>
      buildScheduleRows({
        crmEntries,
        calendarEvents,
        daysAhead,
      }),
    [crmEntries, calendarEvents, daysAhead],
  )

  const visible = useMemo(() => {
    if (filter === 'all') return scheduleRows
    if (filter === 'follow_up') return scheduleRows.filter((r) => r.kind === 'follow_up')
    return scheduleRows.filter((r) => r.kind === 'meeting' || r.kind === 'calendar')
  }, [scheduleRows, filter])

  const counts = useMemo(() => {
    const followUps = scheduleRows.filter((r) => r.kind === 'follow_up').length
    const meetings = scheduleRows.filter((r) => r.kind !== 'follow_up').length
    return { all: scheduleRows.length, followUps, meetings }
  }, [scheduleRows])

  const filterBtn = (key: Filter, label: string) => {
    const active = filter === key
    return (
      <button
        type="button"
        key={key}
        onClick={() => setFilter(key)}
        style={{
          ...buttonSecondaryStyle,
          padding: '5px 10px',
          fontSize: 12,
          background: active ? 'rgba(232, 93, 4, 0.22)' : buttonSecondaryStyle.background,
          borderColor: active ? colors.accent : colors.border,
          color: active ? colors.text : colors.muted,
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <h2 style={{ ...sectionTitleStyle, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarClock size={18} /> Schedule
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select
            style={{ ...buttonSecondaryStyle, padding: '6px 10px' }}
            value={daysAhead}
            onChange={(e) => setDaysAhead(Number(e.target.value))}
          >
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </select>
          {configured && enabled ? (
            <a
              href={zohoCalendarWebUrl(settings)}
              target="_blank"
              rel="noreferrer"
              style={{
                ...buttonSecondaryStyle,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ExternalLink size={14} /> Zoho Calendar
            </a>
          ) : null}
          {enabled ? (
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? <Loader2 size={14} /> : <RefreshCw size={14} />}
              Refresh
            </button>
          ) : null}
          {enabled ? (
            <button type="button" style={buttonPrimaryStyle} onClick={() => setScheduleOpen(true)}>
              <Plus size={14} /> Schedule meeting
            </button>
          ) : null}
          <Link to="/follow-ups" style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}>
            All follow-ups
          </Link>
        </div>
      </div>

      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>
        CRM follow-ups and Zoho Calendar meetings in one place
        {!enabled
          ? ' — turn on Calendar sync in Settings to pull Zoho meetings and schedule team invites.'
          : '.'}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {filterBtn('all', `All (${counts.all})`)}
        {filterBtn('follow_up', `Follow-ups (${counts.followUps})`)}
        {filterBtn('meeting', `Meetings (${counts.meetings})`)}
      </div>

      {error ? (
        <div style={{ marginBottom: 12 }}>
          <p style={{ color: colors.danger, fontSize: 13, margin: '0 0 4px' }}>{error}</p>
          <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>
            Follow-ups from CRM still show below. Scheduling may still work.
          </p>
        </div>
      ) : null}

      {loading && enabled && calendarEvents.length === 0 && !error ? (
        <p style={{ color: colors.muted, fontSize: 13 }}>Loading calendar…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title="Nothing scheduled"
          subtitle="Set a follow-up date on a CRM company, or schedule a team meeting."
          actionLabel={enabled ? 'Schedule meeting' : 'Open CRM'}
          onAction={enabled ? () => setScheduleOpen(true) : () => navigate('/crm')}
        />
      ) : (
        <div style={{ ...tableWrapStyle, maxHeight: 420, overflow: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>CRM / detail</th>
                <th style={thStyle}>Owner</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const badge = kindBadge(row.kind)
                const crmEntry = row.crmId
                  ? crmEntries.find((c) => c.id === row.crmId)
                  : null
                const contact = crmEntry
                  ? primaryContact(hydrateContacts(crmEntry))?.name || crmEntry.primary_contact
                  : ''
                return (
                  <tr key={row.id}>
                    <td style={tdStyle}>
                      <span style={{ color: row.overdue ? colors.danger : colors.text }}>
                        {formatWhen(row)}
                      </span>
                      {row.overdue ? (
                        <div style={{ fontSize: 11, color: colors.danger }}>Overdue</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: badge.color,
                          background: `${badge.color}22`,
                          padding: '2px 8px',
                          borderRadius: 999,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{row.title}</div>
                      {row.detail ? (
                        <div style={{ fontSize: 11, color: colors.muted2 }}>{row.detail}</div>
                      ) : null}
                      {row.attendees ? (
                        <div style={{ fontSize: 11, color: colors.muted2 }}>With {row.attendees}</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>
                      {row.crmId ? (
                        <>
                          <Link
                            to={`/crm?edit=${row.crmId}`}
                            style={{ color: colors.accent, textDecoration: 'none' }}
                          >
                            {row.crmName}
                          </Link>
                          {contact ? (
                            <div style={{ fontSize: 11, color: colors.muted2 }}>{contact}</div>
                          ) : null}
                          {row.quoteRef ? (
                            <div style={{ fontSize: 11 }}>
                              <Link
                                to={`/quotations?ref=${encodeURIComponent(row.quoteRef)}`}
                                style={{ color: colors.accent, textDecoration: 'none' }}
                              >
                                {row.quoteRef}
                              </Link>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={tdStyle}>{row.owner}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {enabled ? (
        <ScheduleMeetingModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          settings={settings}
          team={team}
          crmEntries={crmEntries}
          onCreated={() => void load()}
        />
      ) : null}
    </div>
  )
}
