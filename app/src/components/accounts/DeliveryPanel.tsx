import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addMonths, format, parseISO } from 'date-fns'
import { AlertTriangle, CalendarClock, Clock, FileText, Pencil, Play, Plus, Sparkles, Square, Trash2 } from 'lucide-react'
import Modal from '../Modal'
import CallNotesModal from './CallNotesModal'
import BuildChecklistCard from './BuildChecklistCard'
import { useCompactCrm } from '../../hooks/useMediaQuery'
import { useRunningTimer } from '../../hooks/useRunningTimer'
import { useToast } from '../../contexts/ToastContext'
import { useSettings } from '../../contexts/SettingsContext'
import {
  BUILD_STAGE_STATUSES,
  REQUIREMENT_STATUSES,
  TIME_CATEGORIES,
  VAT_RATE,
  buildProgress,
  calculateOverage,
  earlyExitFee,
  effectiveMonthlyFee,
  hoursAlert,
  hoursInMonth,
  monthKey,
  monthLabel,
  orderedStages,
  packageFees,
  profitability,
  ratesFromSettings,
  renewalFlag,
  renewalLabel,
  requirementsSignedOff,
  stageLabel,
  termEndFromStart,
} from '../../lib/delivery'
import {
  type ContractInput,
  addTimeEntry,
  currentContract,
  deleteRequirement,
  deleteTimeEntry,
  ensureStages,
  listContracts,
  listPackages,
  listRequirements,
  listStages,
  listTimeEntries,
  listUsage,
  saveContract,
  saveRequirement,
  saveUsage,
  updateStage,
} from '../../lib/deliveryStore'
import { logAccountEvent } from '../../lib/accountsStore'
import { buildHoursLogged } from '../../lib/buildTemplates'
import { assistCostInMonth, type ProposedRequirement } from '../../lib/aiAssist'
import { listAiUsage } from '../../lib/aiAssistStore'
import { listContractInvoices, runContractBilling, skipSetupInvoice } from '../../lib/contractBillingStore'
import { editedByHand } from '../../lib/usageImport'
import { getUsageSource, saveUsageSource } from '../../lib/usageImportStore'
import { can } from '../../lib/permissions'
import { errorMessage } from '../../lib/errors'
import { formatAED } from '../../lib/money'
import { FORGOTTEN_TIMER_HOURS, elapsedHours, elapsedLabel, hoursLabel, timerHours } from '../../lib/timeTracking'
import type {
  Account,
  AppUser,
  BuildStage,
  BuildStageStatus,
  Contract,
  ContractInvoice,
  DeliveryPackage,
  Requirement,
  RequirementStatus,
  TimeCategory,
  TimeEntry,
  UsageRecord,
  UsageSourceRow,
  UserRole,
} from '../../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
} from '../../lib/uiStyles'

type Props = {
  account: Account
  editable: boolean
  userRole: UserRole
  team: AppUser[]
  author: { appUserId: string | null; email: string }
}

const smallBtn: CSSProperties = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 0',
  borderTop: '1px solid rgba(255,255,255,0.06)',
  fontSize: 13,
}
const mutedNote: CSSProperties = { color: colors.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }

function day(value: string | null | undefined): string {
  if (!value) return 'Not set'
  try {
    return format(parseISO(String(value).slice(0, 10)), 'd MMM yyyy')
  } catch {
    return String(value)
  }
}

function Bar({ value, max, warn }: { value: number; max: number; warn?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const over = max > 0 && value > max
  return (
    <div
      style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: over ? colors.danger : warn ? colors.warn : colors.accent,
        }}
      />
    </div>
  )
}

function emptyContract(pkg: DeliveryPackage | undefined): ContractInput {
  const start = format(new Date(), 'yyyy-MM-dd')
  const fees = pkg ? packageFees(pkg, 'A') : { monthly_fee: 0, setup_fee: 0 }
  return {
    package_id: pkg?.id ?? null,
    option: 'A',
    ...fees,
    setup_fee_paid: 0,
    term_start: start,
    term_end: termEndFromStart(start),
    discount_percent: 0,
    discount_months_left: 0,
    annual_prepay: false,
    status: 'active',
    notes: '',
    auto_invoice: true,
    billing_from: null,
  }
}

export default function DeliveryPanel({ account, editable, userRole, team, author }: Props) {
  const { showToast } = useToast()
  const { settings } = useSettings()
  const rates = useMemo(() => ratesFromSettings(settings), [settings])
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [stages, setStages] = useState<BuildStage[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [usage, setUsage] = useState<UsageRecord[]>([])
  const [raisedInvoices, setRaisedInvoices] = useState<ContractInvoice[]>([])
  const [usageSource, setUsageSource] = useState<UsageSourceRow | null>(null)
  const [sourceForm, setSourceForm] = useState<{ phones: string; workspace: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [contractForm, setContractForm] = useState<{ id?: string; form: ContractInput } | null>(null)
  const [hoursForm, setHoursForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    hours: '',
    category: 'build' as TimeCategory,
    note: '',
  })
  const thisMonth = monthKey(new Date())
  const [usageMonth, setUsageMonth] = useState(thisMonth)
  const [usageForm, setUsageForm] = useState({ marketing: '', service: '', ai: '', leads: '' })
  const [reqForm, setReqForm] = useState({ title: '', detail: '' })
  const [callNotesOpen, setCallNotesOpen] = useState(false)
  const [assistUsd, setAssistUsd] = useState(0)

  const canContracts = can(userRole, 'delivery.contracts')
  const compact = useCompactCrm()
  const seesProfit = can(userRole, 'delivery.profitability')
  const { timer, now, start: startTimer, clear: clearTimer } = useRunningTimer(author.email)
  const timerHere = timer?.accountId === account.id

  const load = useCallback(async () => {
    try {
      const [p, c, s, r, t, u, ci, src] = await Promise.all([
        listPackages(),
        listContracts(account.id),
        listStages(account.id),
        listRequirements(account.id),
        listTimeEntries(account.id),
        listUsage(account.id),
        can(userRole, 'delivery.contracts') ? listContractInvoices(account.id) : Promise.resolve([]),
        getUsageSource(account.id).catch(() => null),
      ])
      setUsageSource(src)
      if (can(userRole, 'delivery.profitability')) {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        const ai = await listAiUsage(account.id, monthStart.toISOString()).catch(() => [])
        setAssistUsd(assistCostInMonth(ai, account.id, monthKey(new Date())))
      }
      setRaisedInvoices(ci.filter((x) => x.invoice_id))
      setPackages(p)
      setContracts(c)
      setRequirements(r)
      setEntries(t)
      setUsage(u)
      if (editable && s.length < 6) {
        await ensureStages(account.id, s)
        setStages(await listStages(account.id))
      } else {
        setStages(s)
      }
    } catch (e) {
      showToast(errorMessage(e, 'Could not load delivery details'), 'error')
    } finally {
      setLoading(false)
    }
  }, [account.id, editable, showToast, userRole])

  useEffect(() => {
    void load()
  }, [load])

  const contract = currentContract(contracts)
  const pkg = packages.find((p) => p.id === contract?.package_id) ?? null
  const usageRow = usage.find((u) => monthKey(u.month) === usageMonth)

  useEffect(() => {
    setUsageForm({
      marketing: usageRow ? String(usageRow.whatsapp_marketing_count) : '',
      service: usageRow ? String(usageRow.whatsapp_service_count) : '',
      ai: usageRow ? String(usageRow.ai_cost_usd) : '',
      leads: usageRow ? String(usageRow.lead_credits_cost_usd) : '',
    })
  }, [usageRow])

  const monthHours = hoursInMonth(entries, thisMonth)
  const alert = pkg ? hoursAlert(entries, pkg.target_hours) : null
  const renewal = renewalFlag(contract)
  const progress = buildProgress(stages)
  const signedOff = requirementsSignedOff(stages)
  const usageForCalc = {
    whatsapp_marketing_count: Number(usageForm.marketing) || 0,
    whatsapp_service_count: Number(usageForm.service) || 0,
    ai_cost_usd: Number(usageForm.ai) || 0,
    lead_credits_cost_usd: Number(usageForm.leads) || 0,
  }
  const overage = pkg ? calculateOverage(usageForCalc, pkg, rates) : null
  const thisMonthUsage = usage.find((u) => monthKey(u.month) === thisMonth) ?? null
  const thisMonthOverage = pkg && thisMonthUsage ? calculateOverage(thisMonthUsage, pkg, rates).totalAed : 0
  const profit =
    contract && seesProfit
      ? profitability({
          contract,
          pkg,
          usage: thisMonthUsage,
          overageAed: thisMonthOverage,
          hours: monthHours,
          rates,
          assistUsd,
        })
      : null

  const teamName = (id: string | null, email?: string) => {
    const u = id ? team.find((p) => p.id === id) : team.find((p) => p.email === email)
    return u ? u.name || u.email : email || 'Someone'
  }

  async function run(action: () => Promise<void>, failMsg: string) {
    setBusy(true)
    try {
      await action()
      await load()
    } catch (e) {
      showToast(errorMessage(e, failMsg), 'error')
    } finally {
      setBusy(false)
    }
  }

  function openContract() {
    const growth = packages.find((p) => p.code === 'growth') ?? packages[0]
    setContractForm(
      contract
        ? {
            id: contract.id,
            form: {
              package_id: contract.package_id,
              option: contract.option,
              monthly_fee: contract.monthly_fee,
              setup_fee: contract.setup_fee,
              setup_fee_paid: contract.setup_fee_paid,
              term_start: contract.term_start,
              term_end: contract.term_end,
              discount_percent: contract.discount_percent,
              discount_months_left: contract.discount_months_left,
              annual_prepay: contract.annual_prepay,
              status: contract.status,
              notes: contract.notes,
              auto_invoice: Boolean(contract.auto_invoice),
              billing_from: contract.billing_from ?? null,
            },
          }
        : { form: emptyContract(growth) },
    )
  }

  function setContractField<K extends keyof ContractInput>(key: K, value: ContractInput[K]) {
    setContractForm((c) => {
      if (!c) return c
      const form = { ...c.form, [key]: value }
      // Picking a package or option fills in its standard fees; they stay editable.
      if (key === 'package_id' || key === 'option') {
        const p = packages.find((x) => x.id === form.package_id)
        if (p) Object.assign(form, packageFees(p, form.option))
      }
      if (key === 'term_start' && typeof value === 'string' && value) form.term_end = termEndFromStart(value)
      return { ...c, form }
    })
  }

  async function submitContract() {
    if (!contractForm) return
    const f = contractForm.form
    const isNew = !contractForm.id
    const before = contracts.find((c) => c.id === contractForm.id)
    const switchedOn = Boolean(f.auto_invoice) && !isNew && !before?.auto_invoice
    let raised = 0
    await run(async () => {
      const contractId = await saveContract(
        account.id,
        {
          ...f,
          monthly_fee: Number(f.monthly_fee) || 0,
          setup_fee: Number(f.setup_fee) || 0,
          setup_fee_paid: Number(f.setup_fee_paid) || 0,
          discount_percent: Number(f.discount_percent) || 0,
          discount_months_left: Math.max(0, Math.floor(Number(f.discount_months_left) || 0)),
          term_start: f.term_start || null,
          term_end: f.term_end || null,
          billing_from: f.auto_invoice ? f.billing_from || null : null,
        },
        contractForm.id,
      )
      if (f.auto_invoice) {
        // A running contract switched on later starts with monthly invoices;
        // its setup fee was already handled by hand.
        if (switchedOn && before) await skipSetupInvoice(before)
        try {
          raised = (await runContractBilling({ rates, settings, author, contractId })).raised
        } catch (e) {
          showToast(errorMessage(e, 'Contract saved, but its invoice could not be raised. It will be tried again next time.'), 'error')
        }
      }
      const name = packages.find((p) => p.id === f.package_id)?.name ?? 'custom'
      await logAccountEvent(
        account.id,
        isNew
          ? `Contract added: ${name}, option ${f.option}, ${formatAED(Number(f.monthly_fee) || 0)} a month`
          : `Contract updated: ${name}, option ${f.option}, status ${f.status}`,
        author,
      )
      setContractForm(null)
      if (raised > 0) {
        showToast(`Contract saved. ${raised} draft invoice${raised === 1 ? '' : 's'} raised on Invoices.`, 'success')
      }
    }, 'Could not save the contract')
  }

  async function submitHours(e?: FormEvent) {
    e?.preventDefault()
    const hours = Number(hoursForm.hours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      showToast('Enter hours between 0.25 and 24', 'error')
      return
    }
    await run(async () => {
      await addTimeEntry(
        account.id,
        { date: hoursForm.date, hours, category: hoursForm.category, note: hoursForm.note.trim() },
        author,
      )
      setHoursForm((f) => ({ ...f, hours: '', note: '' }))
      showToast(`${hours}h logged`, 'success')
    }, 'Could not log the hours')
  }

  function startTimerHere() {
    if (timer && !timerHere) {
      const forgotten = elapsedHours(timer.startedAt) > FORGOTTEN_TIMER_HOURS
      const ok = window.confirm(
        forgotten
          ? `Your timer on ${timer.accountName} has run for ${elapsedLabel(timer.startedAt)}, so it was probably left on. Throw it away and start a new one here?`
          : `Your timer on ${timer.accountName} is still running. Log ${hoursLabel(timerHours(timer.startedAt))} there and start a new one here?`,
      )
      if (!ok) return
      if (!forgotten) {
        const other = timer
        void run(async () => {
          await addTimeEntry(
            other.accountId,
            { date: format(parseISO(other.startedAt), 'yyyy-MM-dd'), hours: timerHours(other.startedAt), category: other.category, note: 'Timer' },
            author,
          )
          showToast(`${hoursLabel(timerHours(other.startedAt))} logged on ${other.accountName}`, 'success')
          startTimer({ accountId: account.id, accountName: account.name, category: hoursForm.category })
        }, `Could not log the hours on ${other.accountName}`)
        return
      }
    }
    startTimer({ accountId: account.id, accountName: account.name, category: hoursForm.category })
  }

  async function stopTimer() {
    if (!timer || !timerHere) return
    const started = timer.startedAt
    const date = format(parseISO(started), 'yyyy-MM-dd')
    if (elapsedHours(started) > FORGOTTEN_TIMER_HOURS) {
      // Probably left running: let the person enter the real hours instead.
      clearTimer()
      setHoursForm((f) => ({ ...f, date, hours: '', category: timer.category }))
      showToast(`The timer ran for ${elapsedLabel(started)}, so nothing was logged. Enter the real hours below.`, 'error')
      document.getElementById('log-hours-input')?.focus()
      return
    }
    const hours = timerHours(started)
    await run(async () => {
      await addTimeEntry(
        account.id,
        { date, hours, category: timer.category, note: hoursForm.note.trim() || 'Timer' },
        author,
      )
      clearTimer()
      setHoursForm((f) => ({ ...f, note: '' }))
      showToast(`${hoursLabel(hours)} logged from the timer`, 'success')
    }, 'Could not log the timer hours')
  }

  async function submitSource() {
    if (!sourceForm) return
    await run(async () => {
      await saveUsageSource(account.id, sourceForm, usageSource, author.email)
      setSourceForm(null)
      showToast('Usage import links saved', 'success')
    }, 'Could not save the usage links')
  }

  async function submitUsage() {
    await run(async () => {
      await saveUsage(account.id, usageMonth, usageForCalc, usageRow)
      showToast(`Usage saved for ${monthLabel(usageMonth)}`, 'success')
    }, 'Could not save usage')
  }

  async function changeStage(s: BuildStage, status: BuildStageStatus) {
    let blocker_note = s.blocker_note
    if (status === 'blocked') {
      const note = window.prompt(`What is blocking ${stageLabel(s.stage)}?`, s.blocker_note || '')
      if (note === null) return
      blocker_note = note.trim()
    } else {
      blocker_note = ''
    }
    await run(async () => {
      await updateStage(s.id, { status, blocker_note })
      const label = BUILD_STAGE_STATUSES.find((x) => x.value === status)?.label ?? status
      await logAccountEvent(
        account.id,
        `Build: ${stageLabel(s.stage)} is ${label.toLowerCase()}${blocker_note ? ` (${blocker_note})` : ''}`,
        author,
      )
    }, 'Could not update the stage')
  }

  async function addRequirement(e: FormEvent) {
    e.preventDefault()
    if (!reqForm.title.trim()) return
    await run(async () => {
      await saveRequirement(
        account.id,
        {
          title: reqForm.title.trim(),
          detail: reqForm.detail.trim(),
          status: 'open',
          source: '',
          is_change_request: signedOff,
        },
        author.email,
      )
      if (signedOff) {
        await logAccountEvent(account.id, `Change request raised: ${reqForm.title.trim()}`, author)
      }
      setReqForm({ title: '', detail: '' })
    }, 'Could not add the requirement')
  }

  async function addFromCallNotes(items: ProposedRequirement[]) {
    for (const item of items) {
      await saveRequirement(
        account.id,
        { title: item.title, detail: item.detail, status: 'open', source: 'call notes', is_change_request: signedOff },
        author.email,
      )
    }
    if (items.length) {
      await logAccountEvent(
        account.id,
        `${items.length} ${signedOff ? 'change requests' : 'requirements'} added from call notes`,
        author,
      )
    }
    await load()
    showToast(`${items.length} added`, 'success')
  }

  async function changeRequirement(r: Requirement, status: RequirementStatus) {
    await run(async () => {
      const becomesChange = status === 'changed' && signedOff
      await saveRequirement(
        account.id,
        {
          title: r.title,
          detail: r.detail,
          status,
          source: r.source,
          is_change_request: r.is_change_request || becomesChange,
        },
        author.email,
        r.id,
      )
      if (becomesChange && !r.is_change_request) {
        await logAccountEvent(account.id, `Change request: ${r.title} changed after sign off`, author)
      }
    }, 'Could not update the requirement')
  }

  if (loading) return <div style={{ ...cardStyle, color: colors.muted, marginTop: 16 }}>Loading delivery…</div>

  const canLog = editable && userRole !== 'viewer'

  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
      {canLog && compact ? (
        <button
          type="button"
          style={buttonPrimaryStyle}
          onClick={() => {
            document.getElementById('log-hours')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            document.getElementById('log-hours-input')?.focus({ preventScroll: true })
          }}
        >
          <Clock size={16} /> Log hours
        </button>
      ) : null}
      {alert?.flagged || renewal ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {alert?.flagged ? (
            <div
              role="alert"
              style={{ ...cardStyle, padding: 14, borderColor: 'rgba(239,68,68,0.45)', fontSize: 13 }}
            >
              <AlertTriangle size={15} style={{ color: colors.danger, verticalAlign: -2, marginRight: 6 }} />
              <strong>{alert.message}.</strong>{' '}
              <span style={{ color: colors.muted }}>
                Hours ran above {alert.threshold}h (target {pkg?.target_hours}h plus 25%) two months in a row:{' '}
                {alert.months
                  .filter((m) => m.hours > 0)
                  .map((m) => `${monthLabel(m.month)} ${m.hours}h`)
                  .join(', ')}
                .
              </span>
            </div>
          ) : null}
          {renewal ? (
            <div style={{ ...cardStyle, padding: 14, borderColor: 'rgba(245,158,11,0.45)', fontSize: 13 }}>
              <CalendarClock size={15} style={{ color: colors.warn, verticalAlign: -2, marginRight: 6 }} />
              <strong>{renewalLabel(renewal)}</strong>{' '}
              <span style={{ color: colors.muted }}>Term end {day(renewal.termEnd)}. Book the renewal review.</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Contract</h2>
            {canContracts && editable ? (
              <button type="button" style={smallBtn} onClick={openContract}>
                {contract ? <Pencil size={12} /> : <Plus size={12} />} {contract ? 'Edit' : 'Add'}
              </button>
            ) : null}
          </div>
          {!contract ? (
            <p style={{ ...mutedNote, marginTop: 12 }}>
              No contract yet. Add one to set the package, fees and term, and to switch on the hours and usage
              checks.
            </p>
          ) : (
            <dl style={{ margin: '12px 0 0', fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
              <dt style={{ color: colors.muted }}>Package</dt>
              <dd style={{ margin: 0 }}>
                {pkg?.name ?? 'Custom'}, option {contract.option}
                {contract.status !== 'active' ? ` (${contract.status})` : ''}
              </dd>
              <dt style={{ color: colors.muted }}>Monthly</dt>
              <dd style={{ margin: 0 }}>
                {formatAED(effectiveMonthlyFee(contract))}
                {contract.discount_months_left > 0 && contract.discount_percent > 0
                  ? ` after ${contract.discount_percent}% off, ${contract.discount_months_left} months left`
                  : ''}
                <span style={{ color: colors.muted2 }}> plus VAT</span>
              </dd>
              {contract.setup_fee > 0 ? (
                <>
                  <dt style={{ color: colors.muted }}>Setup fee</dt>
                  <dd style={{ margin: 0 }}>
                    {formatAED(contract.setup_fee)}, {formatAED(contract.setup_fee_paid)} paid
                  </dd>
                </>
              ) : null}
              <dt style={{ color: colors.muted }}>Term</dt>
              <dd style={{ margin: 0 }}>
                {day(contract.term_start)} to {day(contract.term_end)}
                {contract.annual_prepay ? ', paid yearly' : ''}
              </dd>
              <dt style={{ color: colors.muted }}>Early exit</dt>
              <dd style={{ margin: 0 }}>{formatAED(earlyExitFee(contract))}</dd>
              {canContracts ? (
                <>
                  <dt style={{ color: colors.muted }}>Invoices</dt>
                  <dd style={{ margin: 0 }}>
                    {contract.auto_invoice ? 'Raised automatically' : 'Raised by hand'}
                    {contract.auto_invoice && contract.billing_from
                      ? `, monthly from ${monthLabel(contract.billing_from)}`
                      : ''}
                    {raisedInvoices.length ? (
                      <>
                        .{' '}
                        <Link to={`/invoices?account=${account.id}`} style={{ color: colors.text }}>
                          {raisedInvoices.length} raised so far
                        </Link>
                      </>
                    ) : null}
                  </dd>
                </>
              ) : null}
              {pkg ? (
                <>
                  <dt style={{ color: colors.muted }}>Support</dt>
                  <dd style={{ margin: 0 }}>{pkg.support_response}</dd>
                </>
              ) : null}
            </dl>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Build progress</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span>
              {progress.done} of {progress.total} stages done
            </span>
            <span style={{ color: colors.muted }}>{progress.done === progress.total ? 'Live' : `Now: ${progress.current}`}</span>
          </div>
          <Bar value={progress.done} max={progress.total} />
          <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {orderedStages(stages).map((s) => {
              const real = stages.find((x) => x.stage === s.stage)
              return (
                <li key={s.stage} style={{ ...rowStyle, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: s.status === 'done' ? 400 : 600 }}>{stageLabel(s.stage)}</div>
                    {real?.status === 'blocked' && real.blocker_note ? (
                      <div style={{ fontSize: 11, color: colors.danger }}>Blocked: {real.blocker_note}</div>
                    ) : null}
                  </div>
                  {canLog && real ? (
                    <select
                      style={{ ...selectStyle, width: 130, padding: '6px 8px', fontSize: 12 }}
                      value={real.status}
                      disabled={busy}
                      aria-label={`${stageLabel(s.stage)} status`}
                      onChange={(e) => void changeStage(real, e.target.value as BuildStageStatus)}
                    >
                      {BUILD_STAGE_STATUSES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ color: colors.muted, fontSize: 12 }}>
                      {BUILD_STAGE_STATUSES.find((o) => o.value === s.status)?.label}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        <section style={cardStyle} id="log-hours">
          <h2 style={sectionTitleStyle}>Hours this month</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span>
              <strong>{monthHours}h</strong> of {pkg ? `${pkg.target_hours}h target` : 'no target yet'}
            </span>
            {pkg && monthHours > pkg.target_hours ? (
              <span style={{ color: colors.danger }}>{Math.round((monthHours / pkg.target_hours - 1) * 100)}% over</span>
            ) : null}
          </div>
          <Bar value={monthHours} max={pkg?.target_hours ?? 0} warn={Boolean(pkg && monthHours > pkg.target_hours * 0.8)} />
          {canLog ? (
            <div
              aria-label="Timer"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${timerHere ? 'rgba(232,93,4,0.5)' : colors.border}`,
                background: timerHere ? 'rgba(232,93,4,0.08)' : 'transparent',
              }}
            >
              {timerHere && timer ? (
                <>
                  <span style={{ flex: '1 1 160px', fontSize: 13 }}>
                    <strong style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{elapsedLabel(timer.startedAt, now)}</strong>{' '}
                    <span style={{ color: colors.muted }}>
                      {TIME_CATEGORIES.find((c) => c.value === timer.category)?.label.toLowerCase()}, logs as{' '}
                      {hoursLabel(timerHours(timer.startedAt, now))}
                    </span>
                  </span>
                  <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void stopTimer()}>
                    <Square size={14} /> Stop and log
                  </button>
                  <button
                    type="button"
                    style={smallBtn}
                    disabled={busy}
                    onClick={() => window.confirm('Throw this timer away without logging it?') && clearTimer()}
                  >
                    Discard
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: '1 1 160px', fontSize: 13, color: colors.muted }}>
                    {timer ? (
                      <>
                        Your timer is running on{' '}
                        <Link to={`/accounts/${timer.accountId}`} style={{ color: colors.text, fontWeight: 600 }}>
                          {timer.accountName}
                        </Link>
                        .
                      </>
                    ) : (
                      'Start the timer when you begin work. Stop it and the hours log themselves.'
                    )}
                  </span>
                  <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={startTimerHere}>
                    <Play size={14} /> {timer ? 'Start here instead' : 'Start timer'}
                  </button>
                </>
              )}
            </div>
          ) : null}
          {canLog ? (
            <form onSubmit={(e) => void submitHours(e)} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <input
                  id="log-hours-input"
                  style={inputStyle}
                  inputMode="decimal"
                  placeholder="Hours"
                  aria-label="Hours"
                  value={hoursForm.hours}
                  onChange={(e) => setHoursForm((f) => ({ ...f, hours: e.target.value }))}
                />
                <select
                  style={selectStyle}
                  aria-label="Category"
                  value={hoursForm.category}
                  onChange={(e) => setHoursForm((f) => ({ ...f, category: e.target.value as TimeCategory }))}
                >
                  {TIME_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <input
                  style={inputStyle}
                  placeholder="What was it for? (optional)"
                  aria-label="Note"
                  value={hoursForm.note}
                  onChange={(e) => setHoursForm((f) => ({ ...f, note: e.target.value }))}
                />
                <button type="submit" style={buttonPrimaryStyle} disabled={busy || !hoursForm.hours}>
                  Log
                </button>
              </div>
              <input
                type="date"
                style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }}
                aria-label="Date"
                value={hoursForm.date}
                onChange={(e) => setHoursForm((f) => ({ ...f, date: e.target.value }))}
              />
            </form>
          ) : null}
          {entries.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
              {entries.slice(0, 5).map((t) => (
                <li key={t.id} style={rowStyle}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{t.hours}h</strong> {TIME_CATEGORIES.find((c) => c.value === t.category)?.label.toLowerCase()}
                    <span style={{ color: colors.muted }}>
                      , {day(t.date)}, {teamName(t.user_id, t.user_email)}
                      {t.note ? `. ${t.note}` : ''}
                    </span>
                  </span>
                  {canLog && (t.user_id === author.appUserId || can(userRole, 'accounts.reassign')) ? (
                    <button
                      type="button"
                      style={{ ...smallBtn, color: colors.danger }}
                      aria-label="Delete entry"
                      onClick={() => void run(() => deleteTimeEntry(t.id), 'Could not delete the entry')}
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ ...mutedNote, marginTop: 12 }}>No hours logged yet.</p>
          )}
        </section>

        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Usage</h2>
            <input
              type="month"
              style={{ ...inputStyle, width: 150, padding: '6px 10px', fontSize: 12 }}
              aria-label="Month"
              value={usageMonth.slice(0, 7)}
              onChange={(e) => e.target.value && setUsageMonth(`${e.target.value}-01`)}
            />
          </div>
          {overage ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>
                  <strong>{overage.usedWhatsapp.toLocaleString('en-AE')}</strong> of{' '}
                  {overage.includedWhatsapp.toLocaleString('en-AE')} WhatsApp conversations
                </span>
              </div>
              <Bar value={overage.usedWhatsapp} max={overage.includedWhatsapp} />
            </>
          ) : (
            <p style={mutedNote}>Add a contract with a package to compare usage with the plan.</p>
          )}
          <div style={{ ...formGridStyle, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: 12 }}>
            {(
              [
                ['marketing', 'Marketing messages'],
                ['service', 'Service or utility'],
                ['ai', 'AI cost (USD)'],
                ['leads', 'Lead credits (USD)'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} style={{ marginBottom: 0 }}>
                <label style={labelStyle}>{label}</label>
                <input
                  style={inputStyle}
                  inputMode="decimal"
                  aria-label={label}
                  value={usageForm[key]}
                  disabled={!canLog}
                  onChange={(e) => setUsageForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {overage ? (
            <div style={{ fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>
              {overage.totalAed > 0 ? (
                <>
                  <div style={{ fontWeight: 600, color: colors.warn }}>
                    Overage {formatAED(overage.totalAed)}{' '}
                    <span style={{ color: colors.muted, fontWeight: 400 }}>
                      plus VAT {formatAED(overage.totalAed * VAT_RATE)}
                    </span>
                  </div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: colors.muted }}>
                    {overage.marketingOver > 0 ? (
                      <li>
                        {overage.marketingOver.toLocaleString('en-AE')} marketing messages at AED {rates.marketingRateAed}:{' '}
                        {formatAED(overage.marketingAed)}
                      </li>
                    ) : null}
                    {overage.serviceOver > 0 ? (
                      <li>
                        {overage.serviceOver.toLocaleString('en-AE')} service messages at AED {rates.serviceRateAed}:{' '}
                        {formatAED(overage.serviceAed)}
                      </li>
                    ) : null}
                    {overage.aiAed > 0 ? (
                      <li>
                        AI USD {overage.aiOverUsd} above the cap, at cost plus {rates.aiMarkupPercent}%:{' '}
                        {formatAED(overage.aiAed)}
                      </li>
                    ) : null}
                    {overage.leadAed > 0 ? (
                      <li>
                        Lead credits USD {overage.leadOverUsd}, at cost plus {rates.leadMarkupPercent}%:{' '}
                        {formatAED(overage.leadAed)}
                      </li>
                    ) : null}
                  </ul>
                </>
              ) : (
                <div style={{ color: colors.success }}>Inside the plan, nothing extra to bill.</div>
              )}
              {overage.notes.map((n) => (
                <div key={n} style={{ color: colors.muted2, fontSize: 12 }}>
                  {n}
                </div>
              ))}
            </div>
          ) : null}
          {canLog ? (
            <button type="button" style={{ ...buttonPrimaryStyle, marginTop: 12 }} disabled={busy} onClick={() => void submitUsage()}>
              Save {monthLabel(usageMonth)}
            </button>
          ) : null}
          <p style={{ ...mutedNote, fontSize: 12, marginTop: 10 }}>
            {usageRow?.imported_at && !editedByHand(usageRow)
              ? `Imported automatically on ${day(usageRow.imported_at)}.`
              : usageRow
                ? 'Entered by hand, so the daily import leaves this month alone.'
                : usageSource && (usageSource.whatsapp_phones.length || usageSource.ai_workspace_id)
                  ? 'Filled in by the daily import.'
                  : 'Entered by hand. Link the WhatsApp number and AI workspace below to import it.'}
          </p>
          {can(userRole, 'delivery.packages') ? (
            sourceForm ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="src-phones">
                    WhatsApp numbers for this client
                  </label>
                  <input
                    id="src-phones"
                    style={inputStyle}
                    placeholder="971501234567, more separated by commas"
                    value={sourceForm.phones}
                    onChange={(e) => setSourceForm((f) => f && { ...f, phones: e.target.value })}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="src-ws">
                    Anthropic workspace ID
                  </label>
                  <input
                    id="src-ws"
                    style={inputStyle}
                    placeholder="wrkspc_..."
                    value={sourceForm.workspace}
                    onChange={(e) => setSourceForm((f) => f && { ...f, workspace: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void submitSource()}>
                    Save links
                  </button>
                  <button type="button" style={smallBtn} onClick={() => setSourceForm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 4 }}>
                <span style={{ color: colors.muted }}>
                  {usageSource && (usageSource.whatsapp_phones.length || usageSource.ai_workspace_id)
                    ? `Import links: ${[
                        usageSource.whatsapp_phones.length ? `WhatsApp ${usageSource.whatsapp_phones.join(', ')}` : '',
                        usageSource.ai_workspace_id ? `AI workspace ${usageSource.ai_workspace_id}` : '',
                      ]
                        .filter(Boolean)
                        .join(', ')}`
                    : 'No import links yet.'}
                </span>
                <button
                  type="button"
                  style={smallBtn}
                  onClick={() =>
                    setSourceForm({
                      phones: usageSource?.whatsapp_phones.join(', ') ?? '',
                      workspace: usageSource?.ai_workspace_id ?? '',
                    })
                  }
                >
                  <Pencil size={12} /> Links
                </button>
              </div>
            )
          ) : null}
        </section>
      </div>

      <BuildChecklistCard
        accountId={account.id}
        canEdit={canLog}
        pkg={pkg}
        buildHours={buildHoursLogged(entries)}
        requirements={requirements}
        authorEmail={author.email}
        onRequirementsAdded={() => void load()}
      />

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Requirements</h2>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 12, color: signedOff ? colors.warn : colors.muted2 }}>
              {signedOff ? 'Signed off. New items count as change requests.' : 'Not signed off yet'}
            </span>
            {canLog ? (
              <button type="button" style={smallBtn} onClick={() => setCallNotesOpen(true)}>
                <Sparkles size={12} /> From call notes
              </button>
            ) : null}
          </span>
        </div>
        <CallNotesModal
          open={callNotesOpen}
          accountId={account.id}
          accountName={account.name}
          existing={requirements.map((r) => r.title)}
          asChangeRequests={signedOff}
          onClose={() => setCallNotesOpen(false)}
          onAdd={addFromCallNotes}
        />
        {requirements.length === 0 ? (
          <p style={{ ...mutedNote, marginTop: 12 }}>
            Nothing captured yet. List what the client asked for, then mark the stage signed off when they agree.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {requirements.map((r) => (
              <li key={r.id} style={{ ...rowStyle, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {r.title}
                    {r.is_change_request ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(245,158,11,0.18)',
                          color: colors.warn,
                        }}
                      >
                        Change request
                      </span>
                    ) : null}
                  </div>
                  {r.detail ? <div style={{ color: colors.muted, whiteSpace: 'pre-wrap' }}>{r.detail}</div> : null}
                </div>
                {canLog ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      style={{ ...selectStyle, width: 110, padding: '6px 8px', fontSize: 12 }}
                      value={r.status}
                      disabled={busy}
                      aria-label={`${r.title} status`}
                      onChange={(e) => void changeRequirement(r, e.target.value as RequirementStatus)}
                    >
                      {REQUIREMENT_STATUSES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={{ ...smallBtn, color: colors.danger }}
                      aria-label={`Delete ${r.title}`}
                      onClick={() =>
                        window.confirm(`Delete "${r.title}"?`) &&
                        void run(() => deleteRequirement(r.id), 'Could not delete the requirement')
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: colors.muted }}>
                    {REQUIREMENT_STATUSES.find((o) => o.value === r.status)?.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canLog ? (
          <form onSubmit={(e) => void addRequirement(e)} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <input
              style={inputStyle}
              placeholder={signedOff ? 'New change request' : 'New requirement'}
              value={reqForm.title}
              onChange={(e) => setReqForm((f) => ({ ...f, title: e.target.value }))}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <input
                style={inputStyle}
                placeholder="Detail (optional)"
                value={reqForm.detail}
                onChange={(e) => setReqForm((f) => ({ ...f, detail: e.target.value }))}
              />
              <button type="submit" style={buttonSecondaryStyle} disabled={busy || !reqForm.title.trim()}>
                <Plus size={14} /> Add
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {profit ? (
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Profitability this month</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, fontSize: 13 }}>
            {(
              [
                ['Fee', formatAED(profit.feeAed)],
                ['Overage', formatAED(profit.overageAed)],
                ['Tool cost', formatAED(profit.toolCostAed)],
                [`Hours (${profit.hours}h at AED ${rates.internalHourlyRateAed})`, formatAED(profit.labourAed)],
                ['Margin', `${formatAED(profit.marginAed)} (${profit.marginPercent}%)`],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <div style={{ color: colors.muted2, fontSize: 11 }}>{label}</div>
                <div
                  style={{
                    fontWeight: 600,
                    color: label === 'Margin' ? (profit.marginAed < 0 ? colors.danger : colors.success) : colors.text,
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
          <p style={{ ...mutedNote, fontSize: 12, marginTop: 10 }}>
            Excludes VAT. Tool cost is the package estimate plus AI and lead credit spend for the month
            {assistUsd > 0 ? `, and $${assistUsd.toFixed(2)} of AI help used in RR Central` : ''}. Only admins and managers
            see this.
          </p>
        </section>
      ) : null}

      <div>
        <Link to={`/accounts/${account.id}/report`} style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}>
          <FileText size={14} /> Monthly report
        </Link>
      </div>

      <Modal
        open={Boolean(contractForm)}
        onClose={() => setContractForm(null)}
        title={contractForm?.id ? 'Edit contract' : 'Add contract'}
        width={620}
      >
        {contractForm ? (
          <>
            <div style={formGridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Package</label>
                <select
                  style={selectStyle}
                  value={contractForm.form.package_id ?? ''}
                  onChange={(e) => setContractField('package_id', e.target.value || null)}
                >
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="">Custom</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Option</label>
                <select
                  style={selectStyle}
                  value={contractForm.form.option}
                  onChange={(e) => setContractField('option', e.target.value as 'A' | 'B')}
                >
                  <option value="A">A: monthly only</option>
                  <option value="B">B: setup fee and lower monthly</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Status</label>
                <select
                  style={selectStyle}
                  value={contractForm.form.status}
                  onChange={(e) => setContractField('status', e.target.value as Contract['status'])}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="ended">Ended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              {(
                [
                  ['monthly_fee', 'Monthly fee (AED, excl. VAT)'],
                  ['setup_fee', 'Setup fee (AED)'],
                  ['setup_fee_paid', 'Setup fee paid so far (AED)'],
                  ['discount_percent', 'Discount %'],
                  ['discount_months_left', 'Discount months left'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} style={fieldStyle}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    aria-label={label}
                    value={String(contractForm.form[key] ?? '')}
                    onChange={(e) => setContractField(key, e.target.value as unknown as number)}
                  />
                </div>
              ))}
              <div style={fieldStyle}>
                <label style={labelStyle}>Term start</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={contractForm.form.term_start ?? ''}
                  onChange={(e) => setContractField('term_start', e.target.value)}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Term end (12 months)</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={contractForm.form.term_end ?? ''}
                  onChange={(e) => setContractField('term_end', e.target.value)}
                />
              </div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={contractForm.form.annual_prepay}
                onChange={(e) => setContractField('annual_prepay', e.target.checked)}
              />
              Paid a year in advance
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(contractForm.form.auto_invoice)}
                onChange={(e) => {
                  const on = e.target.checked
                  setContractField('auto_invoice', on)
                  // Switching on for a running contract: start next month, so this month is not billed twice.
                  if (on && contractForm.id && !contractForm.form.billing_from) {
                    setContractField('billing_from', monthKey(addMonths(new Date(), 1)))
                  }
                }}
              />
              Raise invoices automatically
            </label>
            {contractForm.form.auto_invoice ? (
              <div style={{ ...fieldStyle, marginBottom: 8 }}>
                <label style={labelStyle} htmlFor="c-billing-from">
                  First monthly invoice
                </label>
                <input
                  id="c-billing-from"
                  type="month"
                  style={{ ...inputStyle, maxWidth: 200 }}
                  value={(contractForm.form.billing_from || contractForm.form.term_start || '').slice(0, 7)}
                  onChange={(e) => setContractField('billing_from', e.target.value ? `${e.target.value}-01` : null)}
                />
              </div>
            ) : null}
            <p style={{ ...mutedNote, fontSize: 12, marginBottom: 14 }}>
              {contractForm.form.auto_invoice
                ? `${contractForm.id ? '' : 'When you save, the setup fee (if any) and the first month are invoiced. '}Each month a draft invoice is raised with that month's fee and last month's WhatsApp, AI and lead credit use over the plan. Drafts wait on Invoices for you to check and send.`
                : 'Turn this on to have the setup fee and monthly invoices raised as drafts for you.'}
            </p>
            <p style={{ ...mutedNote, fontSize: 12, marginBottom: 14 }}>
              Prices exclude 5% VAT. Early exit fee with these numbers:{' '}
              {formatAED(
                earlyExitFee({
                  setup_fee: Number(contractForm.form.setup_fee) || 0,
                  setup_fee_paid: Number(contractForm.form.setup_fee_paid) || 0,
                  monthly_fee: Number(contractForm.form.monthly_fee) || 0,
                }),
              )}
              .
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" style={buttonSecondaryStyle} onClick={() => setContractForm(null)}>
                Cancel
              </button>
              <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void submitContract()}>
                {busy ? 'Saving…' : 'Save contract'}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  )
}
