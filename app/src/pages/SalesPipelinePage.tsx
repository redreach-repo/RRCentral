import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { FileSignature, Plus, Target } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import SavedViewsBar from '../components/SavedViewsBar'
import LostReasonFields from '../components/deals/LostReasonFields'
import MakeContractModal from '../components/sales/MakeContractModal'
import SalesDealFormModal, { type SalesDealFormValues } from '../components/sales/SalesDealFormModal'
import { useCompactCrm } from '../hooks/useMediaQuery'
import { canEditAccount, visibleAccounts } from '../lib/accounts'
import { listAccounts, listTeam } from '../lib/accountsStore'
import { listPackages } from '../lib/deliveryStore'
import { LOST_REASONS, isLostReason, lostText, stageMoveProblem } from '../lib/dealRules'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { formatAED } from '../lib/money'
import { can } from '../lib/permissions'
import { parseSalesDealForm } from '../lib/schemas/salesDeal'
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
import {
  listSalesDeals,
  logSalesTouch,
  makeContractFromDeal,
  restoreSalesDeal,
  saveSalesDealForm,
  softDeleteSalesDeal,
  updateSalesDeal,
} from '../lib/salesPipelineStore'
import type { Account, AppUser, DeliveryPackage, SalesDeal, SalesStage } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  sectionTitleStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

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

const STAGE_VALUES = new Set(SALES_STAGES.map((s) => s.value))
const STAGE_BY_LABEL = new Map(SALES_STAGES.map((s) => [s.label.toLowerCase(), s.value]))

function resolveStage(raw: string): SalesStage | '' {
  const value = raw.trim()
  if (!value) return ''
  if (STAGE_VALUES.has(value as SalesStage)) return value as SalesStage
  return STAGE_BY_LABEL.get(value.toLowerCase()) || ''
}

function parseLostFromExport(raw: string): { code: string; note: string } {
  const text = raw.trim()
  if (!text) return { code: '', note: '' }
  const colon = text.indexOf(': ')
  if (colon > 0) {
    const code = text.slice(0, colon).trim()
    const note = text.slice(colon + 2).trim()
    if (isLostReason(code)) return { code, note: note || code }
  }
  if (isLostReason(text)) return { code: text, note: text }
  for (const code of LOST_REASONS) {
    if (text === code || text.startsWith(`${code}:`)) {
      const note = text === code ? code : text.slice(code.length).replace(/^:\s*/, '').trim()
      return { code, note: note || code }
    }
  }
  return { code: '', note: text }
}

function isArchivedFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'yes' || v === 'true' || v === 'y'
}

/** The pre-sale pipeline for AI CRM prospects: lead, discovery call, quote sent, signed. */
export default function SalesPipelinePage() {
  const { t } = useI18n()
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
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<SalesStage | 'all'>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const author = useMemo(() => ({ appUserId, email: user?.email || '' }), [appUserId, user?.email])
  const canWrite = userRole !== 'viewer'
  const canContract = can(userRole, 'delivery.contracts')
  const salesViewFilters = useMemo(
    () => ({
      q: search,
      stage: stageFilter,
      overdue: overdueOnly ? '1' : '0',
      archived: showArchived ? '1' : '0',
    }),
    [search, stageFilter, overdueOnly, showArchived],
  )

  const load = useCallback(async () => {
    try {
      const [d, { rows }, people, pkgs] = await Promise.all([
        listSalesDeals(undefined, { includeDeleted: showArchived }),
        listAccounts(),
        listTeam(),
        listPackages(),
      ])
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
  }, [showToast, showArchived])

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
  const scopedDeals = useMemo(() => {
    const ids = new Set(mineAccounts.map((a) => a.id))
    return deals.filter((d) => ids.has(d.account_id))
  }, [deals, mineAccounts])
  const now = new Date()
  const visibleDeals = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scopedDeals.filter((d) => {
      if (stageFilter !== 'all' && d.stage !== stageFilter) return false
      if (overdueOnly && !isSalesDealOverdue(d, now)) return false
      if (!q) return true
      const name = (accountById.get(d.account_id)?.name || '').toLowerCase()
      return (
        name.includes(q) ||
        (d.next_action || '').toLowerCase().includes(q) ||
        (d.owner_user_id ? (teamById.get(d.owner_user_id)?.name || teamById.get(d.owner_user_id)?.email || '') : '')
          .toLowerCase()
          .includes(q)
      )
    })
  }, [scopedDeals, stageFilter, overdueOnly, search, accountById, teamById, now])
  const totals = pipelineTotals(visibleDeals)
  const overdue = scopedDeals
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

  async function importSalesDealsCsv(file: File) {
    if (!canWrite || missingTable) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      const byName = new Map(editableClients.map((a) => [a.name.trim().toLowerCase(), a] as const))
      const ownerByLabel = new Map(
        team.flatMap((u) => {
          const entries: [string, string][] = []
          if (u.name?.trim()) entries.push([u.name.trim().toLowerCase(), u.id])
          if (u.email?.trim()) entries.push([u.email.trim().toLowerCase(), u.id])
          return entries
        }),
      )
      const today = format(new Date(), 'yyyy-MM-dd')
      const knownRefs = accounts.map((a) => a.reference)
      let saved = 0
      let skipped = 0
      for (const row of objects) {
        if (isArchivedFlag(String(row.archived || ''))) {
          skipped += 1
          continue
        }
        const company = String(row.company || '').trim()
        if (!company) {
          skipped += 1
          continue
        }
        const stage = resolveStage(String(row.stage || ''))
        // Signed deals need Make contract; skip them on import.
        if (!stage || stage === 'signed') {
          skipped += 1
          continue
        }
        const account = byName.get(company.toLowerCase())
        const packageName = String(row.package || '').trim()
        const pkg = packageName
          ? packages.find((p) => p.name.trim().toLowerCase() === packageName.toLowerCase())
          : undefined
        const lost = parseLostFromExport(String(row.lost_reason || ''))
        if (stage === 'lost' && !lost.code) {
          skipped += 1
          continue
        }
        const ownerRaw = String(row.owner || '').trim().toLowerCase()
        const ownerId =
          (ownerRaw && ownerRaw !== 'nobody yet' ? ownerByLabel.get(ownerRaw) : null) ??
          account?.owner_user_id ??
          author.appUserId
        const nextAction = String(row.next_action || '').trim()
        const nextActionDate = String(row.next_action_date || '').trim() || (stage !== 'lost' ? today : '')
        const values: SalesDealFormValues = {
          accountId: account?.id ?? '',
          newCompany: account ? '' : company,
          stage,
          source: String(row.source || '').trim(),
          owner_user_id: ownerId,
          next_action: nextAction,
          next_action_date: nextActionDate || null,
          lost_reason: lost.note,
          lost_reason_code: lost.code,
          notes: String(row.notes || '').trim(),
          discovery_call_date: null,
          package_id: pkg?.id ?? null,
          option: 'A',
          monthly_fee: Number(String(row.monthly_fee ?? '').replace(/,/g, '')) || 0,
          setup_fee: Number(String(row.setup_fee ?? '').replace(/,/g, '')) || 0,
          discount_percent: 0,
          discount_months: 0,
          start_date: null,
          quote_reference: '',
        }
        const parsed = parseSalesDealForm(values)
        if (!parsed.ok) {
          skipped += 1
          continue
        }
        await saveSalesDealForm(parsed.data, null, knownRefs, author)
        saved += 1
      }
      if (!saved && skipped) {
        showToast('No matching sales deal rows in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} sales deal(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Sales deals CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
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
          background: 'transparent',
          border: `1px solid ${isSalesDealOverdue(d, now) ? 'rgba(240,113,120,0.45)' : colors.border}`,
          borderLeft: `2px solid ${isSalesDealOverdue(d, now) ? colors.danger : colors.border}`,
          borderRadius: 8,
          padding: 9,
          display: 'grid',
          gap: 5,
          cursor: editable ? 'grab' : 'default',
          opacity: dragId === d.id ? 0.5 : 1,
        }}
      >
        <button type="button" onClick={() => setEditing({ deal: d })} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 13, letterSpacing: '-0.01em' }}>
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
        {canWrite ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {d.deleted_at ? (
              <button
                type="button"
                style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 11 }}
                onClick={() =>
                  void restoreSalesDeal(d.id)
                    .then(() => {
                      showToast('Deal restored', 'success')
                      return load()
                    })
                    .catch((err) => showToast(errorMessage(err, 'Could not restore'), 'error'))
                }
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 11 }}
                onClick={() => {
                  if (!window.confirm(`Archive ${nameOf(d)}? Use Show archived to restore later.`)) return
                  void softDeleteSalesDeal(d.id)
                    .then(() => {
                      showToast('Deal archived', 'success')
                      return load()
                    })
                    .catch((err) => showToast(errorMessage(err, 'Could not archive'), 'error'))
                }}
              >
                Archive
              </button>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  const quotedMonthly = totals.find((t) => t.stage === 'quote_sent')

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.crm.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.salesDetail.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.salesDetail.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importSalesDealsCsv(file)
            }}
          />
          {canWrite && !missingTable ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!visibleDeals.length}
            onClick={() => {
              exportListCsv(
                'sales-pipeline-deals.csv',
                [
                  'company',
                  'stage',
                  'owner',
                  'next_action',
                  'next_action_date',
                  'monthly_fee',
                  'setup_fee',
                  'package',
                  'overdue',
                  'archived',
                ],
                visibleDeals.map((d) => ({
                  company: nameOf(d),
                  stage: d.stage,
                  owner: personName(d.owner_user_id),
                  next_action: d.next_action || '',
                  next_action_date: d.next_action_date || '',
                  monthly_fee: d.monthly_fee ?? '',
                  setup_fee: d.setup_fee ?? '',
                  package: d.package_id ? packageById.get(d.package_id)?.name || d.package_id : '',
                  overdue: isSalesDealOverdue(d, now) ? 'yes' : 'no',
                  archived: d.deleted_at ? 'yes' : 'no',
                })),
              )
              showToast('Sales deals CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          {canWrite && !missingTable ? (
            <button type="button" className={docsStyles.newBtn} onClick={() => setEditing({ deal: null })}>
              <Plus size={16} /> {t('page.salesDetail.new')}
            </button>
          ) : null}
        </div>
      </header>

      <SavedViewsBar
        moduleId="sales_pipeline"
        filters={salesViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => {
          setSearch(String(f.q || ''))
          const stage = String(f.stage || 'all')
          setStageFilter(
            stage === 'all' || SALES_STAGES.some((s) => s.value === stage) ? (stage as SalesStage | 'all') : 'all',
          )
          setOverdueOnly(String(f.overdue || '0') === '1')
          setShowArchived(String(f.archived || '0') === '1')
        }}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.q || '') === String(b.q || '') &&
          String(a.stage || 'all') === String(b.stage || 'all') &&
          String(a.overdue || '0') === String(b.overdue || '0') &&
          String(a.archived || '0') === String(b.archived || '0')
        }
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <input
          style={{ ...inputStyle, maxWidth: 260 }}
          placeholder="Search company, action, owner…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={{ ...selectStyle, maxWidth: 180 }}
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as SalesStage | 'all')}
        >
          <option value="all">All stages</option>
          {SALES_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.muted }}>
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
      </div>

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
        <span style={{ flex: '1 1 220px', fontSize: 13, color: colors.muted, lineHeight: 1.45 }}>
          Prefer <strong style={{ color: colors.text }}>Pipeline</strong> for the shared board across CRM, AI CRM,
          and CTRM. Use this page when you need the detailed AI CRM stage board or Make contract.
        </span>
        <Link
          to="/deals?pipeline=sales&view=board"
          style={{ ...buttonPrimaryStyle, textDecoration: 'none' }}
        >
          Open Pipeline
        </Link>
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
      ) : missingTable ? null : scopedDeals.length === 0 ? (
        <EmptyState
          icon={<Target size={22} />}
          title="No sales deals yet"
          subtitle="Add the first AI CRM prospect, with the next thing to do and when."
          actionLabel={canWrite ? 'Add a deal' : undefined}
          onAction={() => setEditing({ deal: null })}
        />
      ) : visibleDeals.length === 0 ? (
        <EmptyState
          icon={<Target size={22} />}
          title="No deals match"
          subtitle="Clear search or stage filters to see the board again."
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
                ? { display: 'grid', gap: 8 }
                : { display: 'grid', gridTemplateColumns: `repeat(${SALES_STAGES.length}, minmax(190px, 1fr))`, gap: 8, minWidth: SALES_STAGES.length * 200 }
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
                  style={{ ...cardStyle, padding: 8, minHeight: compact ? 0 : 140, display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 650, letterSpacing: '-0.01em', color: s.value === 'lost' ? colors.muted2 : colors.text }}>
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
