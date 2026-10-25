import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { FileSignature, Plus, Target } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import LostReasonFields from '../components/deals/LostReasonFields'
import MakeContractModal from '../components/sales/MakeContractModal'
import SalesDealFormModal, { type SalesDealFormValues } from '../components/sales/SalesDealFormModal'
import { useCompactCrm } from '../hooks/useMediaQuery'
import { canEditAccount, visibleAccounts } from '../lib/accounts'
import { listAccounts, listTeam } from '../lib/accountsStore'
import { listPackages } from '../lib/deliveryStore'
import { lostText, stageMoveProblem } from '../lib/dealRules'
import { errorMessage } from '../lib/errors'
import { formatAED } from '../lib/money'
import { can } from '../lib/permissions'
import {
  SALES_STAGES,
  canMakeContract,
  hasQuote,
  isOpenSalesDeal,
  isSalesDealOverdue,
  pipelineTotals,
  salesDealProblem,
  salesStageLabel,
} from '../lib/salesPipeline'
import { listSalesDeals, logSalesTouch, makeContractFromDeal, saveSalesDealForm, updateSalesDeal } from '../lib/salesPipelineStore'
import type { Account, AppUser, DeliveryPackage, SalesDeal, SalesStage } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
  selectStyle,
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

/** The pre-sale pipeline for AI CRM prospects: lead, discovery call, quote sent, signed. */
export default function SalesPipelinePage() {
  const { user, userRole, appUserId } = useAuth()
  const compact = useCompactCrm()
  const { showToast } = useToast()
  const [deals, setDeals] = useState<SalesDeal[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ deal: SalesDeal | null; stage?: SalesStage } | null>(null)
  const [losing, setLosing] = useState<{ deal: SalesDeal; reason: string; code: string } | null>(null)
  const [contractFor, setContractFor] = useState<SalesDeal | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const author = useMemo(() => ({ appUserId, email: user?.email || '' }), [appUserId, user?.email])
  const canWrite = userRole !== 'viewer'
  const canContract = can(userRole, 'delivery.contracts')

  const load = useCallback(async () => {
    try {
      const [d, { rows }, people, pkgs] = await Promise.all([listSalesDeals(), listAccounts(), listTeam(), listPackages()])
      setDeals(d.rows)
      setMissingTable(d.missingTable)
      setAccounts(rows)
      setTeam(people)
      setPackages(pkgs)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the pipeline'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const teamById = useMemo(() => new Map(team.map((u) => [u.id, u])), [team])
  const packageById = useMemo(() => new Map(packages.map((p) => [p.id, p])), [packages])
  const mineAccounts = useMemo(() => visibleAccounts(accounts, userRole, appUserId), [accounts, userRole, appUserId])
  const editableClients = useMemo(
    () => mineAccounts.filter((a) => a.type === 'ai_crm_client' && canEditAccount(a, userRole, appUserId)),
    [mineAccounts, userRole, appUserId],
  )
  // RLS already limits staff in the cloud; this keeps local mode the same.
  const visibleDeals = useMemo(() => {
    const ids = new Set(mineAccounts.map((a) => a.id))
    return deals.filter((d) => ids.has(d.account_id))
  }, [deals, mineAccounts])
  const totals = pipelineTotals(visibleDeals)
  const now = new Date()
  const overdue = visibleDeals
    .filter((d) => isSalesDealOverdue(d, now))
    .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))

  const nameOf = (d: SalesDeal) => accountById.get(d.account_id)?.name ?? 'Unknown company'
  const personName = (id: string | null) => {
    if (!id) return 'Nobody yet'
    const u = teamById.get(id)
    return u ? u.name || u.email : 'Former team member'
  }
  const canEdit = (d: SalesDeal) => {
    const a = accountById.get(d.account_id)
    return a ? canEditAccount(a, userRole, appUserId) : false
  }

  async function move(deal: SalesDeal, stage: SalesStage) {
    if (stage === deal.stage || !canEdit(deal)) return
    if (stage === 'lost') {
      setLosing({ deal, reason: '', code: '' })
      return
    }
    if (stage === 'signed') {
      if (canMakeContract(deal) && canContract) setContractFor(deal)
      else if (!hasQuote(deal)) setEditing({ deal, stage: 'quote_sent' })
      else showToast('Only admins, managers and sales can make the contract', 'error')
      return
    }
    // A move that needs more details (a quote, a next action) goes through the form.
    if (salesDealProblem({ ...deal, stage })) {
      setEditing({ deal, stage })
      return
    }
    try {
      await updateSalesDeal(deal, { stage }, author)
      showToast(`${nameOf(deal)} moved to ${salesStageLabel(stage)}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not move the deal'), 'error')
    }
  }

  async function confirmLost() {
    if (!losing) return
    const problem = stageMoveProblem({
      open: false,
      lost: true,
      next_action: '',
      next_action_date: null,
      lost_reason_code: losing.code,
      lost_note: losing.reason,
    })
    if (problem) {
      showToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      await updateSalesDeal(losing.deal, { stage: 'lost', lost_reason_code: losing.code, lost_reason: losing.reason.trim() }, author)
      setLosing(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not mark the deal lost'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmContract() {
    if (!contractFor) return
    setSaving(true)
    try {
      await makeContractFromDeal(contractFor, accountById.get(contractFor.account_id), author)
      showToast(`Contract made for ${nameOf(contractFor)}`, 'success')
      setContractFor(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the contract'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function touch(deal: SalesDeal) {
    try {
      await logSalesTouch(deal, author)
      showToast('Marked as touched today', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save'), 'error')
    }
  }

  async function handleSave(values: SalesDealFormValues) {
    if (!editing) return
    setSaving(true)
    try {
      await saveSalesDealForm(values, editing.deal, accounts.map((a) => a.reference), author)
      setEditing(null)
      showToast('Deal saved', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the deal'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const editingDeal = editing?.deal ?? null

  function nextLine(d: SalesDeal) {
    if (!isOpenSalesDeal(d)) return d.stage === 'lost' ? `Lost: ${lostText(d.lost_reason_code || '', d.lost_reason)}` : `Signed ${d.signed_at ? format(parseISO(d.signed_at), 'd MMM') : ''}`
    const late = isSalesDealOverdue(d, now)
    return (
      <span style={{ color: late ? colors.danger : colors.muted }}>
        {d.next_action}
        {d.next_action_date ? `, ${format(parseISO(d.next_action_date), 'd MMM')}` : ''}
        {late ? ' (overdue)' : ''}
      </span>
    )
  }

  function dealCard(d: SalesDeal) {
    const editable = canEdit(d)
    const pkg = d.package_id ? packageById.get(d.package_id) : undefined
    return (
      <div
        key={d.id}
        draggable={editable && isOpenSalesDeal(d)}
        onDragStart={() => setDragId(d.id)}
        onDragEnd={() => setDragId(null)}
        data-deal={nameOf(d)}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${isSalesDealOverdue(d, now) ? 'rgba(239,68,68,0.5)' : colors.border}`,
          borderRadius: 10,
          padding: 10,
          display: 'grid',
          gap: 6,
          cursor: editable ? 'grab' : 'default',
          opacity: dragId === d.id ? 0.5 : 1,
        }}
      >
        <button type="button" onClick={() => setEditing({ deal: d })} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          {nameOf(d)}
        </button>
        {hasQuote(d) ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span style={chip('rgba(255,255,255,0.08)', colors.muted)}>
              {pkg?.name ?? 'Package'} {d.option}
            </span>
            <span style={chip('rgba(34,197,94,0.15)', '#4ade80')}>{formatAED(Number(d.monthly_fee))} a month</span>
          </div>
        ) : null}
        <div style={{ fontSize: 12 }}>{nextLine(d)}</div>
        <div style={{ fontSize: 11, color: colors.muted2 }}>{personName(d.owner_user_id)}</div>
        {d.contract_id ? (
          <Link to={`/accounts/${d.account_id}`} style={{ fontSize: 12, color: colors.muted }}>
            Open the client
          </Link>
        ) : null}
        {editable && isOpenSalesDeal(d) ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              aria-label={`Move ${nameOf(d)}`}
              style={{ ...selectStyle, padding: '4px 6px', fontSize: 12, flex: 1, minWidth: 0 }}
              value={d.stage}
              onChange={(e) => void move(d, e.target.value as SalesStage)}
            >
              {SALES_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              title="Spoke to them today"
              onClick={() => void touch(d)}
              style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 11 }}
            >
              Touched
            </button>
            {canContract && canMakeContract(d) ? (
              <button
                type="button"
                onClick={() => setContractFor(d)}
                style={{ ...buttonPrimaryStyle, padding: '4px 8px', fontSize: 11 }}
              >
                <FileSignature size={12} /> Make contract
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  const quotedMonthly = totals.find((t) => t.stage === 'quote_sent')

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>AI CRM sales pipeline</h1>
          <p style={pageSubtitleStyle}>
            Prospects for an AI CRM, from first contact to a signed contract. A quote becomes the contract with Make contract.
          </p>
        </div>
        {canWrite && !missingTable ? (
          <button type="button" style={buttonPrimaryStyle} onClick={() => setEditing({ deal: null })}>
            <Plus size={16} /> New deal
          </button>
        ) : null}
      </div>

      {missingTable ? (
        <div style={{ ...cardStyle, color: colors.warn }}>Run the sales pipeline SQL in Supabase first, then reload this page.</div>
      ) : null}

      {visibleDeals.length ? (
        <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 12px' }}>
          {totals
            .filter((t) => t.stage !== 'lost')
            .map((t) => `${t.label} ${t.count}`)
            .join(', ')}
          {quotedMonthly && quotedMonthly.monthly ? `. Quotes out: ${formatAED(quotedMonthly.monthly)} a month.` : '.'}
        </p>
      ) : null}

      {overdue.length ? (
        <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="Overdue next actions">
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

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading the pipeline…</div>
      ) : missingTable ? null : visibleDeals.length === 0 ? (
        <EmptyState
          icon={<Target size={22} />}
          title="No sales deals yet"
          subtitle="Add the first AI CRM prospect, with the next thing to do and when."
          actionLabel={canWrite ? 'Add a deal' : undefined}
          onAction={() => setEditing({ deal: null })}
        />
      ) : (
        <div style={compact ? undefined : { overflowX: 'auto', paddingBottom: 8 }}>
          {compact ? (
            <p style={{ fontSize: 12, color: colors.muted2, margin: '0 0 8px' }}>
              No deals in:{' '}
              {SALES_STAGES.filter((s) => !visibleDeals.some((d) => d.stage === s.value))
                .map((s) => s.label)
                .join(', ') || 'none, every stage has a deal'}
            </p>
          ) : null}
          <div
            style={
              compact
                ? { display: 'grid', gap: 10 }
                : { display: 'grid', gridTemplateColumns: `repeat(${SALES_STAGES.length}, minmax(210px, 1fr))`, gap: 10, minWidth: SALES_STAGES.length * 220 }
            }
          >
            {SALES_STAGES.map((s) => {
              const inStage = visibleDeals.filter((d) => d.stage === s.value)
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
      )}

      <SalesDealFormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        deal={editingDeal}
        stage={editing?.stage}
        accounts={editableClients}
        packages={packages}
        team={team}
        defaultOwnerId={appUserId}
        saving={saving}
        onSave={(v) => void handleSave(v)}
      />

      <MakeContractModal
        deal={contractFor}
        companyName={contractFor ? nameOf(contractFor) : ''}
        packages={packages}
        saving={saving}
        onClose={() => setContractFor(null)}
        onConfirm={() => void confirmContract()}
      />

      <Modal open={Boolean(losing)} onClose={() => setLosing(null)} title="Mark as lost" width={460}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void confirmLost()
          }}
        >
          <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 10px' }}>
            {losing ? nameOf(losing.deal) : ''} moves to Lost.
          </p>
          <LostReasonFields
            idPrefix="sales-lost"
            code={losing?.code ?? ''}
            note={losing?.reason ?? ''}
            notePlaceholder="Went with another agency, no budget this year"
            onChange={({ code, note }) => setLosing((l) => (l ? { ...l, code, reason: note } : l))}
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
