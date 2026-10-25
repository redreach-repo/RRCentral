import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Briefcase, Columns3, List } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import EmptyState from '../components/EmptyState'
import { DIVISIONS } from '../lib/config'
import { errorMessage } from '../lib/errors'
import { formatAED } from '../lib/money'
import {
  BOARD_COLUMNS,
  PIPELINE_LABELS,
  dealAccess,
  dealSources,
  dealTotals,
  filterDeals,
  sortDeals,
  type DealFilters,
  type DealPipeline,
  type DealRow,
} from '../lib/myDeals'
import { loadMyDeals } from '../lib/myDealsStore'
import type { AppUser } from '../lib/types'
import {
  cardStyle,
  colors,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
} from '../lib/uiStyles'

const VIEW_KEY = 'rr.myDeals.view'

const chip = (bg: string, color: string): CSSProperties => ({
  display: 'inline-flex',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color,
  whiteSpace: 'nowrap',
})

const PIPELINE_CHIPS: Record<DealPipeline, CSSProperties> = {
  crm: chip('rgba(59,130,246,0.15)', '#93c5fd'),
  sales: chip('rgba(34,197,94,0.15)', '#4ade80'),
  ctrm: chip('rgba(168,85,247,0.15)', '#d8b4fe'),
}

const money = (n: number | null) => (n === null ? '-' : formatAED(n))
const nice = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM') : '-')

function readView(): 'table' | 'board' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'table'
  } catch {
    return 'table'
  }
}

/**
 * Every deal in one place: the original CRM, AI CRM sales and CTRM Next,
 * as a table or a board. Deals are moved on their own pages; each row links
 * there. Starts on the signed in person's own deals.
 */
export default function MyDealsPage() {
  const { userRole, appUserId } = useAuth()
  const { settings } = useSettings()
  const [deals, setDeals] = useState<DealRow[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'table' | 'board'>(readView)
  const [filters, setFilters] = useState<DealFilters>({
    owner: appUserId || 'all',
    pipeline: 'all',
    source: 'all',
    division: 'all',
    showClosed: false,
  })
  const access = dealAccess(userRole)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await loadMyDeals(userRole, settings)
      setDeals(result.deals)
      setTeam(result.team)
      setError('')
    } catch (e) {
      setError(errorMessage(e, 'Could not load the deals'))
    } finally {
      setLoading(false)
    }
  }, [userRole, settings])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (appUserId) setFilters((f) => (f.owner === 'all' ? { ...f, owner: appUserId } : f))
  }, [appUserId])

  function changeView(next: 'table' | 'board') {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Remembering the view is only a convenience.
    }
  }

  const shown = useMemo(() => sortDeals(filterDeals(deals, filters)), [deals, filters])
  const totals = dealTotals(shown)
  const sources = useMemo(() => dealSources(deals), [deals])
  const set = (patch: Partial<DealFilters>) => setFilters((f) => ({ ...f, ...patch }))

  const filterBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <select aria-label="Owner" style={selectStyle} value={filters.owner} onChange={(e) => set({ owner: e.target.value })}>
        {appUserId ? <option value={appUserId}>My deals</option> : null}
        <option value="all">Everyone</option>
        <option value="none">Nobody owns it</option>
        {team
          .filter((u) => u.id !== appUserId)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email}
            </option>
          ))}
      </select>
      <select
        aria-label="Pipeline"
        style={selectStyle}
        value={filters.pipeline}
        onChange={(e) => set({ pipeline: e.target.value as DealFilters['pipeline'] })}
      >
        <option value="all">All pipelines</option>
        {access.pipelines.map((p) => (
          <option key={p} value={p}>
            {PIPELINE_LABELS[p]}
          </option>
        ))}
      </select>
      <select aria-label="Source" style={selectStyle} value={filters.source} onChange={(e) => set({ source: e.target.value })}>
        <option value="all">Any source</option>
        {sources.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select aria-label="Division" style={selectStyle} value={filters.division} onChange={(e) => set({ division: e.target.value })}>
        <option value="all">All divisions</option>
        {DIVISIONS.map((d) => (
          <option key={d.code} value={d.code}>
            {d.code} {d.brand}
          </option>
        ))}
        <option value="none">No division</option>
      </select>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.muted }}>
        <input type="checkbox" checked={filters.showClosed} onChange={(e) => set({ showClosed: e.target.checked })} />
        Won and lost too
      </label>
      <span style={{ flex: 1 }} />
      <div role="group" aria-label="View" style={{ display: 'inline-flex', gap: 4 }}>
        {(['table', 'board'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => changeView(v)}
            style={{
              ...chip(view === v ? 'rgba(255,255,255,0.14)' : 'transparent', view === v ? colors.text : colors.muted),
              border: `1px solid ${colors.border}`,
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: 12,
              gap: 4,
              alignItems: 'center',
            }}
          >
            {v === 'table' ? <List size={13} /> : <Columns3 size={13} />} {v === 'table' ? 'Table' : 'Board'}
          </button>
        ))}
      </div>
    </div>
  )

  const nextCell = (d: DealRow) => (
    <>
      {d.next_action || <span style={{ color: colors.muted2 }}>No next step</span>}
      {d.next_action_date ? (
        <span style={{ color: d.overdue ? colors.danger : colors.muted, marginLeft: 6 }}>{nice(d.next_action_date)}</span>
      ) : null}
    </>
  )

  const table = (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Account</th>
            <th style={thStyle}>Deal</th>
            <th style={thStyle}>Stage</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Weighted</th>
            <th style={thStyle}>Next action</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Days in stage</th>
            <th style={thStyle}>Owner</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => (
            <tr key={d.key}>
              <td style={tdStyle}>
                <Link to={d.link} style={{ color: colors.text, fontWeight: 600 }}>
                  {d.account}
                </Link>
              </td>
              <td style={tdStyle}>
                <span style={PIPELINE_CHIPS[d.pipeline]}>{PIPELINE_LABELS[d.pipeline]}</span>{' '}
                <span style={{ color: colors.muted }}>{d.deal}</span>
              </td>
              <td style={tdStyle}>{d.stageLabel}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{money(d.value)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{money(d.weighted)}</td>
              <td style={tdStyle}>{nextCell(d)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{d.days_in_stage}</td>
              <td style={{ ...tdStyle, color: d.owner_label ? colors.text : colors.muted2 }}>{d.owner_label || 'Nobody'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const columns = BOARD_COLUMNS.filter((c) => filters.showClosed || (c.value !== 'won' && c.value !== 'lost'))
  const board = (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))`, gap: 10, minWidth: columns.length * 230 }}>
        {columns.map((c) => {
          const inColumn = shown.filter((d) => d.column === c.value)
          const sum = dealTotals(inColumn)
          return (
            <div key={c.value} data-column={c.value} style={{ ...cardStyle, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {c.label} <span style={{ color: colors.muted2, fontWeight: 400 }}>{inColumn.length}</span>
                {sum.weighted ? <div style={{ fontWeight: 400, color: colors.muted }}>{formatAED(sum.weighted)} weighted</div> : null}
              </div>
              {inColumn.map((d) => (
                <Link
                  key={d.key}
                  to={d.link}
                  style={{
                    display: 'grid',
                    gap: 4,
                    padding: 10,
                    borderRadius: 10,
                    textDecoration: 'none',
                    color: colors.text,
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${d.overdue ? 'rgba(239,68,68,0.5)' : colors.border}`,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{d.account}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <span style={PIPELINE_CHIPS[d.pipeline]}>{PIPELINE_LABELS[d.pipeline]}</span>
                    <span style={chip('rgba(255,255,255,0.08)', colors.muted)}>{d.stageLabel}</span>
                  </span>
                  {d.value !== null ? (
                    <span style={{ fontSize: 12 }}>
                      {formatAED(d.value)} <span style={{ color: colors.muted }}>({money(d.weighted)} weighted)</span>
                    </span>
                  ) : null}
                  <span style={{ fontSize: 12 }}>{nextCell(d)}</span>
                  <span style={{ fontSize: 11, color: colors.muted2 }}>
                    {d.owner_label || 'Nobody'}, {d.days_in_stage} days in stage
                  </span>
                </Link>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>My deals</h1>
          <p style={pageSubtitleStyle}>
            {access.pipelines.map((p) => PIPELINE_LABELS[p]).join(', ')} deals in one list. Open a deal to move it on its own page.
          </p>
        </div>
      </div>

      {filterBar}

      {error ? <div style={{ ...cardStyle, color: colors.danger, marginBottom: 12 }}>{error}</div> : null}

      {!loading && shown.length ? (
        <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 12px' }}>
          {totals.count} {totals.count === 1 ? 'deal' : 'deals'}, {formatAED(totals.value)} in value, {formatAED(totals.weighted)} weighted.
          {access.commission ? '' : ' CTRM Next commission is not shown for your role.'}
        </p>
      ) : null}

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading the deals…</div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={22} />}
          title="No deals here"
          subtitle="Nothing matches these filters. Try Everyone, or tick Won and lost too."
        />
      ) : view === 'table' ? (
        table
      ) : (
        board
      )}
    </div>
  )
}
