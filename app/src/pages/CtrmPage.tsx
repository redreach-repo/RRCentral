import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { Handshake, Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { useCompactCrm } from '../hooks/useMediaQuery'
import Modal from '../components/Modal'
import DealFormModal, { type DealFormValues } from '../components/ctrm/DealFormModal'
import { canEditAccount, visibleAccounts } from '../lib/accounts'
import { listAccounts, listContacts, listTeam } from '../lib/accountsStore'
import {
  CTRM_REGIONS,
  CTRM_STAGES,
  STALE_DAYS,
  companyTypeLabel,
  dealProblem,
  isOpenDeal,
  isOverdue,
  isStale,
  regionLabel,
  stageLabel,
} from '../lib/ctrm'
import { listCommissions, listDeals, logTouch, saveDealForm, updateDeal } from '../lib/ctrmStore'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import { formatAED } from '../lib/money'
import type { Account, AccountContact, AppUser, CtrmCommission, CtrmDeal, CtrmStage } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
} from '../lib/uiStyles'

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

export default function CtrmPage() {
  const { user, userRole, appUserId } = useAuth()
  const compact = useCompactCrm()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [deals, setDeals] = useState<CtrmDeal[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [commissions, setCommissions] = useState<CtrmCommission[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ deal: CtrmDeal | null; stage?: CtrmStage } | null>(null)
  const [losing, setLosing] = useState<{ deal: CtrmDeal; reason: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const view = searchParams.get('view') === 'table' ? 'table' : 'board'
  const region = searchParams.get('region') || 'all'
  const owner = searchParams.get('owner') || 'all'
  const showCommission = can(userRole, 'ctrm.commission')
  const author = useMemo(() => ({ appUserId, email: user?.email || '' }), [appUserId, user?.email])

  const load = useCallback(async () => {
    try {
      const [d, { rows }, people, allContacts, comm] = await Promise.all([
        listDeals(),
        listAccounts(),
        listTeam(),
        listContacts(),
        showCommission ? listCommissions() : Promise.resolve([] as CtrmCommission[]),
      ])
      setDeals(d)
      setAccounts(rows)
      setTeam(people)
      setContacts(allContacts)
      setCommissions(comm)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the pipeline'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, showCommission])

  useEffect(() => {
    void load()
  }, [load])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const teamById = useMemo(() => new Map(team.map((u) => [u.id, u])), [team])
  const commissionByDeal = useMemo(() => new Map(commissions.map((c) => [c.deal_id, c])), [commissions])
  const mineAccounts = useMemo(() => visibleAccounts(accounts, userRole, appUserId), [accounts, userRole, appUserId])
  const prospects = useMemo(
    () => mineAccounts.filter((a) => a.type === 'ctrm_prospect' && canEditAccount(a, userRole, appUserId)),
    [mineAccounts, userRole, appUserId],
  )
  // RLS already limits staff in the cloud; this keeps local mode the same.
  const visibleDeals = useMemo(() => {
    const ids = new Set(mineAccounts.map((a) => a.id))
    return deals.filter((d) => ids.has(d.account_id))
  }, [deals, mineAccounts])
  const filtered = useMemo(
    () =>
      visibleDeals.filter((d) => {
        if (region !== 'all' && d.region !== region) return false
        if (owner === 'me' && d.owner_user_id !== appUserId) return false
        if (owner === 'none' && d.owner_user_id) return false
        if (!['all', 'me', 'none'].includes(owner) && d.owner_user_id !== owner) return false
        return true
      }),
    [visibleDeals, region, owner, appUserId],
  )
  const now = new Date()
  const overdue = filtered
    .filter((d) => isOverdue(d, now))
    .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))
  const stale = filtered.filter((d) => isStale(d, now)).sort((a, b) => a.last_touch_at.localeCompare(b.last_touch_at))

  const nameOf = (d: CtrmDeal) => accountById.get(d.account_id)?.name ?? 'Unknown company'
  const personName = (id: string | null) => {
    if (!id) return 'Nobody yet'
    const u = teamById.get(id)
    return u ? u.name || u.email : 'Former team member'
  }
  const canEdit = (d: CtrmDeal) => {
    const a = accountById.get(d.account_id)
    return a ? canEditAccount(a, userRole, appUserId) : false
  }

  function setFilter(key: string, value: string, fallback: string) {
    // Read the live URL so two quick changes do not undo each other.
    const params = new URLSearchParams(window.location.search)
    if (value === fallback) params.delete(key)
    else params.set(key, value)
    setSearchParams(params, { replace: true })
  }

  async function move(deal: CtrmDeal, stage: CtrmStage) {
    if (stage === deal.stage || !canEdit(deal)) return
    if (stage === 'lost') {
      setLosing({ deal, reason: '' })
      return
    }
    // Reopening a deal without a next action goes through the form so one gets added.
    if (dealProblem({ ...deal, stage })) {
      setEditing({ deal, stage })
      return
    }
    try {
      await updateDeal(deal, { stage }, author)
      showToast(`${nameOf(deal)} moved to ${stageLabel(stage)}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not move the deal'), 'error')
    }
  }

  async function confirmLost() {
    if (!losing) return
    if (!losing.reason.trim()) {
      showToast('Say why the deal was lost', 'error')
      return
    }
    setSaving(true)
    try {
      await updateDeal(losing.deal, { stage: 'lost', lost_reason: losing.reason.trim() }, author)
      setLosing(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not mark the deal lost'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function touch(deal: CtrmDeal) {
    try {
      await logTouch(deal, 'spoke to them', author)
      showToast('Marked as touched today', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save'), 'error')
    }
  }

  async function handleSave(values: DealFormValues) {
    if (!editing) return
    setSaving(true)
    try {
      await saveDealForm(
        values,
        editing.deal,
        editing.deal ? commissionByDeal.get(editing.deal.id) : undefined,
        accounts.map((a) => a.reference),
        author,
      )
      setEditing(null)
      showToast('Deal saved', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the deal'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const canWrite = userRole !== 'viewer'
  const editingDeal = editing?.deal ? { ...editing.deal, stage: editing.stage ?? editing.deal.stage } : null

  function nextLine(d: CtrmDeal) {
    if (!isOpenDeal(d)) return d.stage === 'lost' ? `Lost: ${d.lost_reason}` : 'Signed'
    const late = isOverdue(d, now)
    return (
      <span style={{ color: late ? colors.danger : colors.muted }}>
        {d.next_action}
        {d.next_action_date ? `, ${format(parseISO(d.next_action_date), 'd MMM')}` : ''}
        {late ? ' (overdue)' : ''}
      </span>
    )
  }

  function dealCard(d: CtrmDeal) {
    const editable = canEdit(d)
    return (
      <div
        key={d.id}
        draggable={editable}
        onDragStart={() => setDragId(d.id)}
        onDragEnd={() => setDragId(null)}
        data-deal={nameOf(d)}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${isOverdue(d, now) ? 'rgba(239,68,68,0.5)' : colors.border}`,
          borderRadius: 10,
          padding: 10,
          display: 'grid',
          gap: 6,
          cursor: editable ? 'grab' : 'default',
          opacity: dragId === d.id ? 0.5 : 1,
        }}
      >
        <button
          type="button"
          onClick={() => setEditing({ deal: d })}
          style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
        >
          {nameOf(d)}
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span style={chip('rgba(255,255,255,0.08)', colors.muted)}>{regionLabel(d.region)}</span>
          {isStale(d, now) ? (
            <span style={chip('rgba(245,158,11,0.18)', '#fbbf24')}>
              No touch {differenceInCalendarDays(now, parseISO(d.last_touch_at))}d
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 12 }}>{nextLine(d)}</div>
        <div style={{ fontSize: 11, color: colors.muted2 }}>{personName(d.owner_user_id)}</div>
        {editable ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              aria-label={`Move ${nameOf(d)}`}
              style={{ ...selectStyle, padding: '4px 6px', fontSize: 12, flex: 1, minWidth: 0 }}
              value={d.stage}
              onChange={(e) => void move(d, e.target.value as CtrmStage)}
            >
              {CTRM_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {isOpenDeal(d) ? (
              <button
                type="button"
                title="Spoke to them today"
                onClick={() => void touch(d)}
                style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 11 }}
              >
                Touched
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>CTRM Next pipeline</h1>
          <p style={pageSubtitleStyle}>
            Companies being introduced to CTRM Next. Kept apart from client delivery and finance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/ctrm/summary" style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}>
            Weekly summary
          </Link>
          {canWrite ? (
            <button type="button" style={buttonPrimaryStyle} onClick={() => setEditing({ deal: null })}>
              <Plus size={16} /> New deal
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <select aria-label="View" style={{ ...selectStyle, maxWidth: 150 }} value={view} onChange={(e) => setFilter('view', e.target.value, 'board')}>
          <option value="board">Board</option>
          <option value="table">Table</option>
        </select>
        <select aria-label="Region" style={{ ...selectStyle, maxWidth: 180 }} value={region} onChange={(e) => setFilter('region', e.target.value, 'all')}>
          <option value="all">Every region</option>
          {CTRM_REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select aria-label="Owner" style={{ ...selectStyle, maxWidth: 200 }} value={owner} onChange={(e) => setFilter('owner', e.target.value, 'all')}>
          <option value="all">Any owner</option>
          <option value="me">Mine</option>
          <option value="none">Nobody yet</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email}
            </option>
          ))}
        </select>
      </div>

      {overdue.length || stale.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
          {overdue.length ? (
            <section style={cardStyle} aria-label="Overdue next actions">
              <h2 style={{ ...sectionTitleStyle, color: colors.danger }}>Overdue next actions ({overdue.length})</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                {overdue.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => setEditing({ deal: d })} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }}>
                      {nameOf(d)}
                    </button>
                    : {d.next_action}, due {format(parseISO(String(d.next_action_date)), 'd MMM')}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {stale.length ? (
            <section style={cardStyle} aria-label="Stale deals">
              <h2 style={{ ...sectionTitleStyle, color: colors.warn }}>
                No touch in {STALE_DAYS} days ({stale.length})
              </h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                {stale.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => setEditing({ deal: d })} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }}>
                      {nameOf(d)}
                    </button>
                    , {stageLabel(d.stage)}, last touch {format(parseISO(d.last_touch_at), 'd MMM')}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading the pipeline…</div>
      ) : visibleDeals.length === 0 ? (
        <EmptyState
          icon={<Handshake size={22} />}
          title="No CTRM Next deals yet"
          subtitle="Add the first company you are introducing to CTRM Next, with the next thing to do and when."
          actionLabel={canWrite ? 'Add a deal' : undefined}
          onAction={() => setEditing({ deal: null })}
        />
      ) : view === 'board' ? (
        <div style={compact ? undefined : { overflowX: 'auto', paddingBottom: 8 }}>
          {/* On a phone the stages stack, and empty ones fold into one line. Cards move with their Move select. */}
          {compact ? (
            <p style={{ fontSize: 12, color: colors.muted2, margin: '0 0 8px' }}>
              No deals in:{' '}
              {CTRM_STAGES.filter((s) => !filtered.some((d) => d.stage === s.value))
                .map((s) => s.label)
                .join(', ') || 'none, every stage has a deal'}
            </p>
          ) : null}
          <div
            style={
              compact
                ? { display: 'grid', gap: 10 }
                : { display: 'grid', gridTemplateColumns: `repeat(${CTRM_STAGES.length}, minmax(200px, 1fr))`, gap: 10, minWidth: CTRM_STAGES.length * 210 }
            }
          >
            {CTRM_STAGES.map((s) => {
              const inStage = filtered.filter((d) => d.stage === s.value)
              if (compact && inStage.length === 0) return null
              return (
                <div
                  key={s.value}
                  data-stage={s.value}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const d = deals.find((x) => x.id === dragId)
                    setDragId(null)
                    if (d) void move(d, s.value)
                  }}
                  style={{ ...cardStyle, padding: 10, minHeight: compact ? 0 : 160, display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: s.value === 'lost' ? colors.muted2 : colors.text }}>
                    {s.label} <span style={{ color: colors.muted2, fontWeight: 400 }}>{inStage.length}</span>
                  </div>
                  {inStage.map((d) => dealCard(d))}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Company</th>
                  <th style={thStyle}>Stage</th>
                  <th style={thStyle}>Region</th>
                  <th style={thStyle}>Next action</th>
                  <th style={thStyle}>Last touch</th>
                  <th style={thStyle}>Owner</th>
                  {showCommission ? <th style={thStyle}>Red Reach commission</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const c = commissionByDeal.get(d.id)
                  return (
                    <tr key={d.id} onClick={() => setEditing({ deal: d })} style={{ cursor: 'pointer' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{nameOf(d)}</div>
                        <div style={{ fontSize: 11, color: colors.muted2 }}>{companyTypeLabel(d.company_type)}</div>
                      </td>
                      <td style={tdStyle}>{stageLabel(d.stage)}</td>
                      <td style={tdStyle}>{regionLabel(d.region)}</td>
                      <td style={{ ...tdStyle, fontSize: 13 }}>{nextLine(d)}</td>
                      <td style={{ ...tdStyle, color: isStale(d, now) ? colors.warn : undefined }}>
                        {format(parseISO(d.last_touch_at), 'd MMM')}
                      </td>
                      <td style={tdStyle}>{personName(d.owner_user_id)}</td>
                      {showCommission ? (
                        <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                          {c ? `${formatAED(Number(c.commission_received))} of ${formatAED(Number(c.expected_commission))}` : '-'}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DealFormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        deal={editingDeal}
        commission={editing?.deal ? commissionByDeal.get(editing.deal.id) : undefined}
        prospects={prospects}
        contacts={contacts}
        team={team}
        defaultOwnerId={appUserId}
        showCommission={showCommission}
        saving={saving}
        onSave={(v) => void handleSave(v)}
      />

      <Modal open={Boolean(losing)} onClose={() => setLosing(null)} title="Mark as lost" width={460}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void confirmLost()
          }}
        >
          <label htmlFor="lost-reason" style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 6 }}>
            Why was {losing ? nameOf(losing.deal) : ''} lost?
          </label>
          <input
            id="lost-reason"
            style={{ ...inputStyle, marginBottom: 12 }}
            value={losing?.reason ?? ''}
            placeholder="Chose another system, no budget this year"
            onChange={(e) => setLosing((l) => (l ? { ...l, reason: e.target.value } : l))}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setLosing(null)}>
              Cancel
            </button>
            <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
              Mark as lost
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
