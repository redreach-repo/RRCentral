import { addMonths, differenceInCalendarDays, format, parseISO, subDays, subMonths } from 'date-fns'
import type {
  BuildStage,
  BuildStageKey,
  BuildStageStatus,
  Contract,
  DeliveryPackage,
  RequirementStatus,
  TimeCategory,
  TimeEntry,
  UsageRecord,
} from './types'

/** Build stages in order. */
export const BUILD_STAGES: { value: BuildStageKey; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'requirements_signed_off', label: 'Requirements signed off' },
  { value: 'build', label: 'Build' },
  { value: 'whatsapp_setup', label: 'WhatsApp setup' },
  { value: 'testing', label: 'Testing' },
  { value: 'live', label: 'Live' },
]

export const BUILD_STAGE_STATUSES: { value: BuildStageStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

export const REQUIREMENT_STATUSES: { value: RequirementStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'agreed', label: 'Agreed' },
  { value: 'built', label: 'Built' },
  { value: 'changed', label: 'Changed' },
]

export const TIME_CATEGORIES: { value: TimeCategory; label: string }[] = [
  { value: 'build', label: 'Build' },
  { value: 'support', label: 'Support' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'leads', label: 'Leads' },
  { value: 'content', label: 'Content' },
  { value: 'admin', label: 'Admin' },
]

export const HOURS_ALERT_MESSAGE = 'Reprice or move up a package at the next review'
/** Actual hours above target by more than this share trigger the hours alert. */
export const HOURS_ALERT_THRESHOLD = 0.25
export const RENEWAL_WINDOW_DAYS = 60
export const CONTRACT_TERM_MONTHS = 12
export const VAT_RATE = 0.05

/** Overage and costing config, stored in app_settings (admin only to change). */
export type DeliveryRates = {
  marketingRateAed: number
  serviceRateAed: number
  aiMarkupPercent: number
  leadMarkupPercent: number
  internalHourlyRateAed: number
  usdToAed: number
  /** Salaries, rent, subscriptions. Only used on the dashboard. */
  fixedMonthlyCostAed: number
}

export const DEFAULT_DELIVERY_RATES: DeliveryRates = {
  marketingRateAed: 0.3,
  serviceRateAed: 0.07,
  aiMarkupPercent: 25,
  leadMarkupPercent: 30,
  internalHourlyRateAed: 150,
  usdToAed: 3.6725,
  fixedMonthlyCostAed: 0,
}

export const DELIVERY_RATE_KEYS: Record<keyof DeliveryRates, string> = {
  marketingRateAed: 'deliveryMarketingRateAed',
  serviceRateAed: 'deliveryServiceRateAed',
  aiMarkupPercent: 'deliveryAiMarkupPercent',
  leadMarkupPercent: 'deliveryLeadMarkupPercent',
  internalHourlyRateAed: 'deliveryInternalHourlyRateAed',
  usdToAed: 'deliveryUsdToAed',
  fixedMonthlyCostAed: 'deliveryFixedMonthlyCostAed',
}

export function ratesFromSettings(settings: Record<string, string | undefined>): DeliveryRates {
  const out = { ...DEFAULT_DELIVERY_RATES }
  for (const [field, key] of Object.entries(DELIVERY_RATE_KEYS) as [keyof DeliveryRates, string][]) {
    const raw = settings[key]
    const n = raw == null || raw === '' ? NaN : Number(raw)
    if (Number.isFinite(n) && n >= 0) out[field] = n
  }
  return out
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** `YYYY-MM-01` for the month containing `date`. */
export function monthKey(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date.slice(0, 10)) : date
  return format(d, 'yyyy-MM-01')
}

export function monthLabel(key: string): string {
  return format(parseISO(key), 'MMMM yyyy')
}

export function hoursInMonth(entries: Pick<TimeEntry, 'date' | 'hours'>[], key: string): number {
  return round2(
    entries.filter((e) => monthKey(e.date) === key).reduce((sum, e) => sum + num(e.hours), 0),
  )
}

export type OverageResult = {
  includedWhatsapp: number
  usedWhatsapp: number
  marketingOver: number
  serviceOver: number
  marketingAed: number
  serviceAed: number
  aiOverUsd: number
  aiAed: number
  leadOverUsd: number
  leadAed: number
  totalAed: number
  /** Plain notes for anything the calculator could not price. */
  notes: string[]
}

/**
 * Monthly overage, excluding VAT.
 *
 * The included WhatsApp volume is one pool. It covers marketing
 * conversations first (the dearer kind), then service and utility ones.
 * AI usage above the package cap is billed at cost plus the AI markup,
 * extra lead data credits at cost plus the lead markup.
 */
export function calculateOverage(
  usage: Pick<
    UsageRecord,
    'whatsapp_marketing_count' | 'whatsapp_service_count' | 'ai_cost_usd' | 'lead_credits_cost_usd'
  >,
  pkg: Pick<DeliveryPackage, 'included_whatsapp' | 'ai_cap_usd' | 'included_lead_credits_usd'>,
  rates: DeliveryRates = DEFAULT_DELIVERY_RATES,
): OverageResult {
  const notes: string[] = []
  const marketing = Math.max(0, Math.floor(num(usage.whatsapp_marketing_count)))
  const service = Math.max(0, Math.floor(num(usage.whatsapp_service_count)))
  const included = Math.max(0, Math.floor(num(pkg.included_whatsapp)))

  const marketingCovered = Math.min(marketing, included)
  const serviceCovered = Math.min(service, included - marketingCovered)
  const marketingOver = marketing - marketingCovered
  const serviceOver = service - serviceCovered
  const marketingAed = round2(marketingOver * rates.marketingRateAed)
  const serviceAed = round2(serviceOver * rates.serviceRateAed)

  let aiOverUsd = 0
  if (pkg.ai_cap_usd == null) {
    if (num(usage.ai_cost_usd) > 0) notes.push('AI cap is not set for this package, so AI usage is not billed.')
  } else {
    aiOverUsd = round2(Math.max(0, num(usage.ai_cost_usd) - num(pkg.ai_cap_usd)))
  }
  const aiAed = round2(aiOverUsd * rates.usdToAed * (1 + rates.aiMarkupPercent / 100))

  const leadOverUsd = round2(
    Math.max(0, num(usage.lead_credits_cost_usd) - num(pkg.included_lead_credits_usd ?? 0)),
  )
  const leadAed = round2(leadOverUsd * rates.usdToAed * (1 + rates.leadMarkupPercent / 100))

  return {
    includedWhatsapp: included,
    usedWhatsapp: marketing + service,
    marketingOver,
    serviceOver,
    marketingAed,
    serviceAed,
    aiOverUsd,
    aiAed,
    leadOverUsd,
    leadAed,
    totalAed: round2(marketingAed + serviceAed + aiAed + leadAed),
    notes,
  }
}

export type HoursAlert = {
  flagged: boolean
  threshold: number
  /** Newest first: this month, last month, the month before. */
  months: { month: string; hours: number; over: boolean }[]
  message: string
}

/**
 * Flag a client whose actual hours run more than 25% above the package
 * target for two months in a row, looking at this month and the two before.
 */
export function hoursAlert(
  entries: Pick<TimeEntry, 'date' | 'hours'>[],
  targetHours: number,
  today: Date = new Date(),
): HoursAlert {
  const target = num(targetHours)
  const threshold = round2(target * (1 + HOURS_ALERT_THRESHOLD))
  const months = [0, 1, 2].map((back) => {
    const key = monthKey(subMonths(today, back))
    const hours = hoursInMonth(entries, key)
    return { month: key, hours, over: target > 0 && hours > threshold }
  })
  const flagged = (months[0].over && months[1].over) || (months[1].over && months[2].over)
  return { flagged, threshold, months, message: flagged ? HOURS_ALERT_MESSAGE : '' }
}

/** The contract that counts for a client: the newest active one, else the newest. */
export function currentContract<T extends Pick<Contract, 'status' | 'created_at'>>(contracts: T[]): T | null {
  const sorted = [...contracts].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return sorted.find((c) => c.status === 'active') ?? sorted[0] ?? null
}

export type RenewalFlag = { kind: 'due' | 'ended'; days: number; termEnd: string }

/** Renewal flag from 60 days before term end. Only for active contracts. */
export function renewalFlag(
  contract: Pick<Contract, 'term_end' | 'status'> | null | undefined,
  today: Date = new Date(),
): RenewalFlag | null {
  if (!contract?.term_end || contract.status !== 'active') return null
  const days = differenceInCalendarDays(parseISO(contract.term_end.slice(0, 10)), today)
  if (days < 0) return { kind: 'ended', days, termEnd: contract.term_end }
  if (days <= RENEWAL_WINDOW_DAYS) return { kind: 'due', days, termEnd: contract.term_end }
  return null
}

export function renewalLabel(flag: RenewalFlag): string {
  if (flag.kind === 'ended') return `Term ended ${Math.abs(flag.days)} days ago`
  if (flag.days === 0) return 'Term ends today'
  return `Renews in ${flag.days} days`
}

/** Last day of a 12 month term starting on `start` (YYYY-MM-DD). */
export function termEndFromStart(start: string): string {
  return format(subDays(addMonths(parseISO(start), CONTRACT_TERM_MONTHS), 1), 'yyyy-MM-dd')
}

/** Monthly fee after any running discount. */
export function effectiveMonthlyFee(
  contract: Pick<Contract, 'monthly_fee' | 'discount_percent' | 'discount_months_left'>,
): number {
  const fee = num(contract.monthly_fee)
  if (num(contract.discount_months_left) <= 0) return round2(fee)
  return round2(fee * (1 - Math.min(100, Math.max(0, num(contract.discount_percent))) / 100))
}

/** Unpaid setup value plus two months of fees. */
export function earlyExitFee(
  contract: Pick<Contract, 'setup_fee' | 'setup_fee_paid' | 'monthly_fee'>,
): number {
  const unpaidSetup = Math.max(0, num(contract.setup_fee) - num(contract.setup_fee_paid))
  return round2(unpaidSetup + 2 * num(contract.monthly_fee))
}

/** Fees for a package and option (A: monthly only; B: setup fee plus a lower monthly). */
export function packageFees(
  pkg: Pick<DeliveryPackage, 'monthly_fee_a' | 'setup_fee_b' | 'monthly_fee_b'>,
  option: 'A' | 'B',
): { monthly_fee: number; setup_fee: number } {
  return option === 'B'
    ? { monthly_fee: num(pkg.monthly_fee_b), setup_fee: num(pkg.setup_fee_b) }
    : { monthly_fee: num(pkg.monthly_fee_a), setup_fee: 0 }
}

export function stageLabel(stage: string): string {
  return BUILD_STAGES.find((s) => s.value === stage)?.label ?? stage
}

/** Stages in order, filling any missing ones as not started. */
export function orderedStages(stages: BuildStage[]): (BuildStage | { stage: BuildStageKey; status: BuildStageStatus; id?: undefined })[] {
  return BUILD_STAGES.map(
    (s) => stages.find((x) => x.stage === s.value) ?? { stage: s.value, status: 'not_started' as const },
  )
}

export function buildProgress(stages: Pick<BuildStage, 'stage' | 'status'>[]): {
  done: number
  total: number
  percent: number
  current: string
} {
  const total = BUILD_STAGES.length
  const done = BUILD_STAGES.filter((s) => stages.find((x) => x.stage === s.value)?.status === 'done').length
  const next = BUILD_STAGES.find((s) => stages.find((x) => x.stage === s.value)?.status !== 'done')
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    current: next ? next.label : 'Live',
  }
}

export function requirementsSignedOff(stages: Pick<BuildStage, 'stage' | 'status'>[]): boolean {
  return stages.some((s) => s.stage === 'requirements_signed_off' && s.status === 'done')
}

export type Profitability = {
  revenueAed: number
  feeAed: number
  overageAed: number
  toolCostAed: number
  labourAed: number
  hours: number
  marginAed: number
  marginPercent: number
}

/**
 * One month for one client. Tool cost is the package's fixed estimate plus
 * the AI and lead credit spend recorded for the month, plus the AI help the
 * team used on this client inside RR Central (ai_usage_log).
 */
export function profitability(input: {
  contract: Pick<Contract, 'monthly_fee' | 'discount_percent' | 'discount_months_left'>
  pkg: Pick<DeliveryPackage, 'tool_cost_aed'> | null
  usage: Pick<UsageRecord, 'ai_cost_usd' | 'lead_credits_cost_usd'> | null
  overageAed: number
  hours: number
  rates: DeliveryRates
  /** RR Central AI help spent on this client this month, USD. */
  assistUsd?: number
}): Profitability {
  const feeAed = effectiveMonthlyFee(input.contract)
  const overageAed = round2(num(input.overageAed))
  const revenueAed = round2(feeAed + overageAed)
  const usageUsd = num(input.usage?.ai_cost_usd) + num(input.usage?.lead_credits_cost_usd) + num(input.assistUsd)
  const toolCostAed = round2(num(input.pkg?.tool_cost_aed) + usageUsd * input.rates.usdToAed)
  const labourAed = round2(num(input.hours) * input.rates.internalHourlyRateAed)
  const marginAed = round2(revenueAed - toolCostAed - labourAed)
  return {
    revenueAed,
    feeAed,
    overageAed,
    toolCostAed,
    labourAed,
    hours: round2(num(input.hours)),
    marginAed,
    marginPercent: revenueAed > 0 ? Math.round((marginAed / revenueAed) * 1000) / 10 : 0,
  }
}

/** Catalogue from the brief. Seeded by the migration; used to seed local mode. */
export const DEFAULT_PACKAGES: Omit<DeliveryPackage, 'id' | 'updated_at'>[] = [
  {
    code: 'starter',
    name: 'Starter',
    monthly_fee_a: 1900,
    setup_fee_b: 1800,
    monthly_fee_b: 1700,
    target_hours: 5,
    build_hours_target: 12,
    included_whatsapp: 1000,
    support_response: '2 working days',
    support_response_days: 2,
    ai_cap_usd: null,
    included_lead_credits_usd: null,
    tool_cost_aed: 0,
    sort: 1,
    active: true,
  },
  {
    code: 'growth',
    name: 'Growth',
    monthly_fee_a: 4500,
    setup_fee_b: 3000,
    monthly_fee_b: 4200,
    target_hours: 14,
    build_hours_target: 20,
    included_whatsapp: 4000,
    support_response: '1 working day',
    support_response_days: 1,
    ai_cap_usd: null,
    included_lead_credits_usd: null,
    tool_cost_aed: 0,
    sort: 2,
    active: true,
  },
  {
    code: 'done_for_you',
    name: 'Done for you',
    monthly_fee_a: 9000,
    setup_fee_b: 4500,
    monthly_fee_b: 8400,
    target_hours: 30,
    build_hours_target: 30,
    included_whatsapp: 8000,
    support_response: 'Same day',
    support_response_days: 0,
    ai_cap_usd: null,
    included_lead_credits_usd: null,
    tool_cost_aed: 0,
    sort: 3,
    active: true,
  },
]
