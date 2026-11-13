import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Briefcase, Columns3, List } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import { DIVISIONS } from '../lib/config'
import {
  applyUniqueCrmAccountLinks,
  type CrmLinkPlan,
} from '../lib/crmAccountLink'
import { LOST_REASONS } from '../lib/dealRules'
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
  stagesForPipeline,
  targetStageForColumn,
  type BoardColumn,
  type DealFilters,
  type DealPipeline,
  type DealRow,
} from '../lib/myDeals'
import { loadMyDeals, moveMyDeal, patchMyDeal } from '../lib/myDealsStore'
import { can } from '../lib/permissions'
import type { AppUser } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

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
    const stored = localStorage.getItem(VIEW_KEY)
    if (stored === 'table' || stored === 'board') return stored
  } catch {
    // ignore
  }
  return 'board'
}

function pipelineFromQuery(raw: string | null, allowed: DealPipeline[]): DealFilters['pipeline'] {
  if (raw === 'crm' || raw === 'sales' || raw === 'ctrm') {
    return allowed.includes(raw) ? raw : 'all'
  }
  return 'all'
}

type PendingMove = {
  deal: DealRow
  stage: string
  kind: 'won' | 'lost'
}

type PendingPatch = {
  deal: DealRow
  next_action: string
  next_action_date: string
  owner_user_id: string
}

/**
 * One pipeline board for CRM, AI CRM sales, and CTRM Next.
 * Drag a card (or pick a stage) to move it; Won/Lost asks for a reason.
 */
export default function MyDealsPage() {
  const { user, userRole, appUserId } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const access = dealAccess(userRole)
  const canLinkAccounts = can(userRole, 'accounts.write')
  const emptyLinkPlan: CrmLinkPlan = { unique: [], ambiguous: [], none: [] }
  const [deals, setDeals] = useState<DealRow[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [linkPlan, setLinkPlan] = useState<CrmLinkPlan>(emptyLinkPlan)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [pendingPatch, setPendingPatch] = useState<PendingPatch | null>(null)
  const [outcomeReason, setOutcomeReason] = useState('')
  const [lostNote, setLostNote] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [view, setView] = useState<'table' | 'board'>(() => {
    const q = searchParams.get('view')
    if (q === 'board' || q === 'table') return q
    return readView()
  })
  const [filters, setFilters] = useState<DealFilters>(() => ({
    owner: appUserId || 'all',
    pipeline: pipelineFromQuery(searchParams.get('pipeline'), access.pipelines),
    source: 'all',
    division: 'all',
    showClosed: false,
  }))

  const author = useMemo(
    () => ({ appUserId: appUserId || null, email: user?.email || '' }),
    [appUserId, user?.email],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await loadMyDeals(userRole, settings)
      setDeals(result.deals)
      setTeam(result.team)
      setLinkPlan(result.linkPlan)
      setError('')
    } catch (e) {
      setError(errorMessage(e, 'Could not load the deals'))
    } finally {
      setLoading(false)
    }
  }, [userRole, settings])

  async function linkUniqueMatches() {
    if (!linkPlan.unique.length || linkBusy) return
    setLinkBusy(true)
    try {
      const n = await applyUniqueCrmAccountLinks(linkPlan.unique)
      showToast(
        n === 1 ? 'Linked 1 CRM deal to its Account' : `Linked ${n} CRM deals to Accounts`,
        'success',
      )
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not link CRM deals'), 'error')
    } finally {
      setLinkBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (appUserId) setFilters((f) => (f.owner === 'all' ? { ...f, owner: appUserId } : f))
  }, [appUserId])

  useEffect(() => {
    const nextPipeline = pipelineFromQuery(searchParams.get('pipeline'), access.pipelines)
    const nextView = searchParams.get('view')
    setFilters((f) => (f.pipeline === nextPipeline ? f : { ...f, pipeline: nextPipeline }))
    if (nextView === 'board' || nextView === 'table') setView(nextView)
  }, [searchParams, access.pipelines])

  function changeView(nextView: 'table' | 'board') {
    setView(nextView)
    try {
      localStorage.setItem(VIEW_KEY, nextView)
    } catch {
      // Remembering the view is only a convenience.
    }
    const params = new URLSearchParams(searchParams)
    params.set('view', nextView)
    setSearchParams(params, { replace: true })
  }

  const shown = useMemo(() => sortDeals(filterDeals(deals, filters)), [deals, filters])
  const totals = dealTotals(shown)
  const sources = useMemo(() => dealSources(deals), [deals])
  const set = (patch: Partial<DealFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    if (patch.pipeline !== undefined) {
      const next = new URLSearchParams(searchParams)
      if (patch.pipeline === 'all') next.delete('pipeline')
      else next.set('pipeline', patch.pipeline)
      setSearchParams(next, { replace: true })
    }
  }

  async function applyMove(deal: DealRow, stage: string, opts: { outcomeReason?: string; lostNote?: string } = {}) {
    if (stage === deal.stage) return
    setBusyKey(deal.key)
    try {
      const result = await moveMyDeal(deal, { stage }, author, opts)
      showToast(`${deal.account} → ${result.stageLabel}`, 'success')
      setPending(null)
      setOutcomeReason('')
      setLostNote('')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not move the deal'), 'error')
    } finally {
      setBusyKey(null)
    }
  }

  function requestMove(deal: DealRow, stage: string) {
    if (!stage || stage === deal.stage) return
    const lower = stage.toLowerCase()
    if (lower === 'lost' || stage === 'Lost') {
      setPending({ deal, stage, kind: 'lost' })
      setOutcomeReason('')
      setLostNote('')
      return
    }
    if (stage === 'Won' || (deal.pipeline === 'crm' && lower === 'won')) {
      setPending({ deal, stage: 'Won', kind: 'won' })
      setOutcomeReason('')
      setLostNote('')
      return
    }
    void applyMove(deal, stage)
  }

  function requestColumnMove(deal: DealRow, column: BoardColumn) {
    if (deal.column === column) return
    requestMove(deal, targetStageForColumn(deal.pipeline, column))
  }

  function openPatch(deal: DealRow) {
    setPendingPatch({
      deal,
      next_action: deal.next_action || '',
      next_action_date: deal.next_action_date || '',
      owner_user_id: deal.owner_user_id || '',
    })
  }

  async function savePatch() {
    if (!pendingPatch) return
    setBusyKey(pendingPatch.deal.key)
    try {
      await patchMyDeal(
        pendingPatch.deal,
        {
          next_action: pendingPatch.next_action,
          next_action_date: pendingPatch.next_action_date || null,
          owner_user_id: pendingPatch.owner_user_id || null,
        },
        author,
      )
      showToast(`Updated ${pendingPatch.deal.account}`, 'success')
      setPendingPatch(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not update the deal'), 'error')
    } finally {
      setBusyKey(null)
    }
  }

  const manageStagesHref =
    filters.pipeline === 'sales' ? '/sales' : filters.pipeline === 'ctrm' ? '/ctrm' : null

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
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        openPatch(d)
      }}
      style={{
        display: 'inline',
        padding: 0,
        margin: 0,
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
      title="Edit next step"
    >
      {d.next_action || <span style={{ color: colors.muted2 }}>No next step</span>}
      {d.next_action_date ? (
        <span style={{ color: d.overdue ? colors.danger : colors.muted, marginLeft: 6 }}>{nice(d.next_action_date)}</span>
      ) : null}
    </button>
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
                {d.pipeline === 'crm' ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: colors.muted2 }}>
                    {d.account_id ? 'Linked account' : 'CRM only'}
                    {d.account_id ? (
                      <>
                        {' · '}
                        <Link to={`/crm?edit=${d.id}`} style={{ color: colors.accent }}>
                          Open sheet
                        </Link>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </td>
              <td style={tdStyle}>
                <span style={PIPELINE_CHIPS[d.pipeline]}>{PIPELINE_LABELS[d.pipeline]}</span>{' '}
                <span style={{ color: colors.muted }}>{d.deal}</span>
              </td>
              <td style={tdStyle}>
                <select
                  aria-label={`Stage for ${d.account}`}
                  style={{ ...selectStyle, maxWidth: 160 }}
                  value={d.stage}
                  disabled={busyKey === d.key}
                  onChange={(e) => requestMove(d, e.target.value)}
                >
                  {stagesForPipeline(d.pipeline).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </td>
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
            <div
              key={c.value}
              data-column={c.value}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const key = e.dataTransfer.getData('text/deal-key') || dragKey
                const deal = shown.find((d) => d.key === key)
                if (deal) requestColumnMove(deal, c.value)
                setDragKey(null)
              }}
              style={{ ...cardStyle, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 }}
            >
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {c.label} <span style={{ color: colors.muted2, fontWeight: 400 }}>{inColumn.length}</span>
                {sum.weighted ? <div style={{ fontWeight: 400, color: colors.muted }}>{formatAED(sum.weighted)} weighted</div> : null}
              </div>
              {inColumn.map((d) => (
                <div
                  key={d.key}
                  draggable={busyKey !== d.key}
                  onDragStart={(e: DragEvent) => {
                    setDragKey(d.key)
                    e.dataTransfer.setData('text/deal-key', d.key)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => setDragKey(null)}
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: 10,
                    borderRadius: 10,
                    color: colors.text,
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${d.overdue ? 'rgba(239,68,68,0.5)' : colors.border}`,
                    opacity: dragKey === d.key || busyKey === d.key ? 0.55 : 1,
                    cursor: 'grab',
                  }}
                >
                  <Link to={d.link} style={{ color: colors.text, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                    {d.account}
                  </Link>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <span style={PIPELINE_CHIPS[d.pipeline]}>{PIPELINE_LABELS[d.pipeline]}</span>
                    {d.pipeline === 'crm' ? (
                      <span style={{ ...PIPELINE_CHIPS.crm, opacity: 0.85 }}>
                        {d.account_id ? 'Linked' : 'Unlinked'}
                      </span>
                    ) : null}
                  </span>
                  <select
                    aria-label={`Stage for ${d.account}`}
                    style={{ ...selectStyle, width: '100%', fontSize: 12 }}
                    value={d.stage}
                    disabled={busyKey === d.key}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => requestMove(d, e.target.value)}
                  >
                    {stagesForPipeline(d.pipeline).map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {d.value !== null ? (
                    <span style={{ fontSize: 12 }}>
                      {formatAED(d.value)} <span style={{ color: colors.muted }}>({money(d.weighted)} weighted)</span>
                    </span>
                  ) : null}
                  <span style={{ fontSize: 12 }}>{nextCell(d)}</span>
                  <span style={{ fontSize: 11, color: colors.muted2 }}>
                    {d.owner_label || 'Nobody'}, {d.days_in_stage} days in stage
                  </span>
                </div>
              ))}
              {inColumn.length === 0 ? (
                <div style={{ fontSize: 12, color: colors.muted2, padding: '8px 2px' }}>Drop deals here</div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Sales · Work</p>
          <h1 className={docsStyles.title}>Pipeline</h1>
          <p className={docsStyles.subtitle}>
            CRM, AI CRM sales, and CTRM Next in one board. Drag a card or change its stage here.
            {manageStagesHref ? (
              <>
                {' '}
                <Link to={manageStagesHref} style={{ color: colors.accent }}>
                  Open detailed stage board
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {filterBar}

      {!loading && (linkPlan.unique.length || linkPlan.ambiguous.length || linkPlan.none.length) ? (
        <div
          role="status"
          style={{
            ...cardStyle,
            marginBottom: 12,
            padding: '12px 14px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <div style={{ flex: '1 1 220px', fontSize: 13, color: colors.muted, lineHeight: 1.45 }}>
            {linkPlan.unique.length ? (
              <>
                <strong style={{ color: colors.text }}>
                  {linkPlan.unique.length === 1
                    ? '1 CRM deal'
                    : `${linkPlan.unique.length} CRM deals`}
                </strong>{' '}
                match a single Account by company name and can be linked safely.
              </>
            ) : (
              <>
                <strong style={{ color: colors.text }}>
                  {linkPlan.ambiguous.length + linkPlan.none.length}
                </strong>{' '}
                CRM deal
                {linkPlan.ambiguous.length + linkPlan.none.length === 1 ? '' : 's'} still need an Account
                link
                {linkPlan.ambiguous.length
                  ? ` (${linkPlan.ambiguous.length} match more than one name)`
                  : ''}
                .
              </>
            )}
            {linkPlan.none.length && linkPlan.unique.length ? (
              <>
                {' '}
                {linkPlan.none.length} have no match
                {linkPlan.ambiguous.length ? `; ${linkPlan.ambiguous.length} are ambiguous` : ''}.
              </>
            ) : null}
          </div>
          {canLinkAccounts && linkPlan.unique.length ? (
            <button
              type="button"
              style={buttonPrimaryStyle}
              disabled={linkBusy}
              onClick={() => void linkUniqueMatches()}
            >
              {linkBusy
                ? 'Linking…'
                : linkPlan.unique.length === 1
                  ? 'Link unique match'
                  : `Link ${linkPlan.unique.length} unique matches`}
            </button>
          ) : null}
          {linkPlan.ambiguous.length || linkPlan.none.length ? (
            <Link to="/crm" style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}>
              Open CRM
            </Link>
          ) : null}
        </div>
      ) : null}

      {error ? <div style={{ ...cardStyle, color: colors.danger, marginBottom: 12 }}>{error}</div> : null}

      {!loading && shown.length ? (
        <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 12px' }}>
          {totals.count} {totals.count === 1 ? 'deal' : 'deals'}, {formatAED(totals.value)} in value, {formatAED(totals.weighted)} weighted.
          {access.commission ? '' : ' CTRM Next commission is not shown for your role.'}
        </p>
      ) : null}

      {loading ? (
        <div className={docsStyles.loading}>Loading the deals…</div>
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

      <Modal
        open={Boolean(pending)}
        title={pending?.kind === 'lost' ? 'Mark deal lost' : 'Mark deal won'}
        onClose={() => {
          setPending(null)
          setOutcomeReason('')
          setLostNote('')
        }}
        width={420}
      >
        {pending ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, color: colors.muted, fontSize: 14, lineHeight: 1.45 }}>
              {pending.deal.account} · {PIPELINE_LABELS[pending.deal.pipeline]}
            </p>
            <div>
              <label style={labelStyle}>{pending.kind === 'lost' ? 'Why lost' : 'Won reason'}</label>
              <select
                style={selectStyle}
                value={outcomeReason}
                onChange={(e) => setOutcomeReason(e.target.value)}
              >
                <option value="">Pick a reason…</option>
                {LOST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            {pending.kind === 'lost' ? (
              <div>
                <label style={labelStyle}>Note</label>
                <input
                  style={inputStyle}
                  value={lostNote}
                  onChange={(e) => setLostNote(e.target.value)}
                  placeholder="Short note"
                />
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  setPending(null)
                  setOutcomeReason('')
                  setLostNote('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                style={buttonPrimaryStyle}
                disabled={busyKey === pending.deal.key}
                onClick={() =>
                  void applyMove(pending.deal, pending.stage, {
                    outcomeReason,
                    lostNote: pending.kind === 'lost' ? lostNote : undefined,
                  })
                }
              >
                Save
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingPatch)}
        title="Next step"
        onClose={() => setPendingPatch(null)}
        width={420}
      >
        {pendingPatch ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, color: colors.muted, fontSize: 14, lineHeight: 1.45 }}>
              {pendingPatch.deal.account} · {PIPELINE_LABELS[pendingPatch.deal.pipeline]}
            </p>
            <div>
              <label style={labelStyle}>Next action</label>
              <input
                style={inputStyle}
                value={pendingPatch.next_action}
                onChange={(e) =>
                  setPendingPatch((p) => (p ? { ...p, next_action: e.target.value } : p))
                }
                placeholder="What happens next"
              />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                style={inputStyle}
                value={pendingPatch.next_action_date}
                onChange={(e) =>
                  setPendingPatch((p) => (p ? { ...p, next_action_date: e.target.value } : p))
                }
              />
            </div>
            <div>
              <label style={labelStyle}>Owner</label>
              <select
                style={selectStyle}
                value={pendingPatch.owner_user_id}
                onChange={(e) =>
                  setPendingPatch((p) => (p ? { ...p, owner_user_id: e.target.value } : p))
                }
              >
                <option value="">Nobody</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={buttonSecondaryStyle} onClick={() => setPendingPatch(null)}>
                Cancel
              </button>
              <button
                type="button"
                style={buttonPrimaryStyle}
                disabled={busyKey === pendingPatch.deal.key}
                onClick={() => void savePatch()}
              >
                Save
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
