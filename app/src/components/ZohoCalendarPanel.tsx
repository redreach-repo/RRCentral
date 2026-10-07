import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { CalendarClock, ExternalLink, Loader2, Plus, RefreshCw, Settings } from 'lucide-react'
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
import { useCompactCrm } from '../hooks/useMediaQuery'
import ScheduleMeetingModal from './ScheduleMeetingModal'
import CalendarSettingsModal from './CalendarSettingsModal'
import EmptyState from './EmptyState'
import resp from '../styles/crmResponsive.module.css'
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
  const compact = useCompactCrm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRow[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
          padding: compact ? '8px 12px' : '5px 10px',
          fontSize: 12,
          minHeight: compact ? 40 : undefined,
          background: active ? 'rgba(232, 93, 4, 0.22)' : buttonSecondaryStyle.background,
          borderColor: active ? colors.accent : colors.border,
          color: active ? colors.text : colors.muted,
        }}
      >
        {label}
      </button>
    )
  }

  const rowCrmBits = (row: ScheduleRow) => {
    const crmEntry = row.crmId ? crmEntries.find((c) => c.id === row.crmId) : null
    const contact = crmEntry
      ? primaryContact(hydrateContacts(crmEntry))?.name || crmEntry.primary_contact
      : ''
    return { crmEntry, contact }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 16, padding: compact ? 14 : cardStyle.padding }}>
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
        <div
          className={compact ? resp.toolbar : undefined}
          style={
            compact
              ? { marginBottom: 0, width: '100%' }
              : { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }
          }
        >
          <select
            style={{
              ...buttonSecondaryStyle,
              padding: compact ? '8px 12px' : '6px 10px',
              minHeight: compact ? 40 : undefined,
              flex: compact ? '1 1 140px' : undefined,
            }}
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
                minHeight: compact ? 40 : undefined,
                padding: compact ? '8px 12px' : buttonSecondaryStyle.padding,
              }}
            >
              <ExternalLink size={14} /> {compact ? 'Zoho' : 'Zoho Calendar'}
            </a>
          ) : null}
          {enabled ? (
            <button
              type="button"
              style={{
                ...buttonSecondaryStyle,
                minHeight: compact ? 40 : undefined,
                padding: compact ? '8px 12px' : buttonSecondaryStyle.padding,
              }}
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? <Loader2 size={14} /> : <RefreshCw size={14} />}
              Refresh
            </button>
          ) : null}
          {enabled ? (
            <button
              type="button"
              style={{
                ...buttonPrimaryStyle,
                minHeight: compact ? 42 : undefined,
                flex: compact ? '1 1 160px' : undefined,
              }}
              onClick={() => setScheduleOpen(true)}
            >
              <Plus size={14} /> {compact ? 'Meeting' : 'Schedule meeting'}
            </button>
          ) : null}
          <button
            type="button"
            style={{
              ...buttonSecondaryStyle,
              minHeight: compact ? 40 : undefined,
              padding: compact ? '8px 12px' : buttonSecondaryStyle.padding,
            }}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={14} /> {compact ? 'Settings' : 'Calendar settings'}
          </button>
          <Link
            to="/follow-ups"
            style={{
              ...buttonSecondaryStyle,
              textDecoration: 'none',
              minHeight: compact ? 40 : undefined,
              padding: compact ? '8px 12px' : buttonSecondaryStyle.padding,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {compact ? 'All FUs' : 'All follow-ups'}
          </Link>
        </div>
      </div>

      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>
        CRM follow-ups and Zoho Calendar meetings in one place
        {!enabled
          ? ' — turn on Calendar sync in Settings to pull Zoho meetings and schedule team invites.'
          : '.'}
      </p>

      <div className={resp.chipRow} style={{ marginBottom: 12 }}>
        {filterBtn('all', compact ? `All · ${counts.all}` : `All (${counts.all})`)}
        {filterBtn(
          'follow_up',
          compact ? `Follow-ups · ${counts.followUps}` : `Follow-ups (${counts.followUps})`,
        )}
        {filterBtn(
          'meeting',
          compact ? `Meetings · ${counts.meetings}` : `Meetings (${counts.meetings})`,
        )}
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
      ) : compact ? (
        <div className={resp.listStack}>
          {visible.map((row) => {
            const badge = kindBadge(row.kind)
            const { contact } = rowCrmBits(row)
            return (
              <article key={row.id} className={resp.card}>
                <div className={resp.cardTop}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: row.overdue ? colors.danger : colors.muted,
                        marginBottom: 4,
                      }}
                    >
                      {formatWhen(row)}
                      {row.overdue ? ' · Overdue' : ''}
                    </div>
                    <div style={{ fontWeight: 650, fontSize: 15, lineHeight: 1.3 }}>{row.title}</div>
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      color: badge.color,
                      background: `${badge.color}22`,
                      padding: '4px 8px',
                      borderRadius: 999,
                      alignSelf: 'flex-start',
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
                {row.detail ? <div className={resp.cardMeta}>{row.detail}</div> : null}
                {row.attendees ? <div className={resp.cardMeta}>With {row.attendees}</div> : null}
                <div className={resp.cardGrid}>
                  <div className={resp.cardField}>
                    <label>CRM</label>
                    {row.crmId ? (
                      <Link
                        to={`/crm?edit=${row.crmId}`}
                        style={{ color: colors.accent, textDecoration: 'none', fontWeight: 600 }}
                      >
                        {row.crmName}
                      </Link>
                    ) : (
                      <span style={{ color: colors.muted2 }}>—</span>
                    )}
                    {contact ? <div className={resp.cardMeta}>{contact}</div> : null}
                  </div>
                  <div className={resp.cardField}>
                    <label>Owner</label>
                    <div style={{ fontSize: 13 }}>{row.owner || '—'}</div>
                  </div>
                  {row.quoteRef ? (
                    <div className={resp.cardField}>
                      <label>Quote</label>
                      <Link
                        to={`/quotations?ref=${encodeURIComponent(row.quoteRef)}`}
                        style={{ color: colors.accent, textDecoration: 'none' }}
                      >
                        {row.quoteRef}
                      </Link>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
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
                const { contact } = rowCrmBits(row)
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

      <CalendarSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  )
}
