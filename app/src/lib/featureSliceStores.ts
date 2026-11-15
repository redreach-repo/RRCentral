/**
 * Supabase stores for M6–M12 feature slices.
 * Missing-table errors surface as empty lists so local mode stays usable.
 */
import { db } from './db'
import { isMissingRelationError } from './errors'
import { withoutSoftDeleted } from './softDelete'
import { isSupabaseConfigured } from './supabaseConfig'
import {
  applyPackFlagsToMap,
  BUILTIN_INDUSTRY_PACKS,
  nextTenantPackStatus,
  type IndustryPackManifest,
  type TenantPackStatus,
} from './industryPacks'
import {
  MODULE_FLAGS_KEY,
  parseModuleFlags,
  serializeModuleFlags,
} from '../modules/registry'
import {
  approvalNeedsChecker,
  canDecideApproval,
  gateMoneyAction,
  summarizeApproval,
  type ApprovalStatus,
} from './makerChecker'
import {
  dailyWageFromBasicMonthly,
  draftGratuityAccrualAed,
  payrollNetAed,
  yearsOfServiceFromStart,
} from './wpsGratuity'
import { nextSubscriptionStatus, planByKey, type SaasSubscriptionStatus } from './saasBillingPlans'
import {
  buildSignedWebhookHeaders,
  DEFAULT_API_KEY_SCOPES,
  deliverWebhookWithRetries,
} from './publicApi'

export type HrEmployee = {
  id: string
  employee_code: string
  full_name: string
  email: string
  job_title: string
  department: string
  employment_status: string
  start_date: string | null
  basic_salary_aed: number | null
  allowances_aed: number
  iban: string
  labour_card_no: string
  bank_routing_code: string
  notes: string
  reports_to_id: string | null
  deleted_at?: string | null
}

export type PayrollRun = {
  id: string
  period_yyyy_mm: string
  status: string
  currency: string
  notes: string
}

export type PayrollLine = {
  id: string
  run_id: string
  employee_id: string
  basic_aed: number
  allowances_aed: number
  deductions_aed: number
  net_aed: number
  gratuity_accrual_aed: number
  wps_ready: boolean
  hr_employees?: Pick<
    HrEmployee,
    'employee_code' | 'full_name' | 'iban' | 'labour_card_no' | 'bank_routing_code'
  > | null
}

export type MarketingCampaign = {
  id: string
  name: string
  channel: string
  status: string
  starts_on: string | null
  ends_on: string | null
  budget_aed: number | null
  notes: string
}

export type TenantSubscription = {
  id: string
  plan_key: string
  status: string
  seats: number
  current_period_end: string | null
  stripe_customer_id: string
  stripe_subscription_id: string
}

export type ApprovalRequest = {
  id: string
  object_type: string
  object_id: string
  action: string
  status: string
  amount_aed: number | null
  summary: string
  requested_by: string | null
  decided_by: string | null
  decision_note: string
  created_at: string
  decided_at: string | null
}

export type ApiKeyRow = {
  id: string
  name: string
  key_prefix: string
  scopes: unknown
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
}

export type WebhookEndpoint = {
  id: string
  url: string
  active: boolean
  event_types: unknown
  last_delivery_at: string | null
  last_delivery_status: string
  delivery_failures?: number
  next_retry_at?: string | null
}

export type TenantIndustryPackRow = {
  id: string
  pack_id: string
  status: string
  activated_at: string | null
  industry_packs?: { pack_key: string; name: string; description: string; version: string } | null
}

async function emptyOnMissing<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (isMissingRelationError(e)) return fallback
    throw e
  }
}

//------------------------------------------------------------
// HR
//------------------------------------------------------------

export async function listHrEmployees(
  status?: string,
  opts?: { includeDeleted?: boolean },
): Promise<HrEmployee[]> {
  return emptyOnMissing(async () => {
    let q = db.from('hr_employees').select('*').order('full_name')
    if (status && status !== 'all') q = q.eq('employment_status', status)
    const { data, error } = await q
    if (error) throw error
    const mapped = (data || []).map(normalizeHr)
    return opts?.includeDeleted ? mapped : withoutSoftDeleted(mapped)
  }, [])
}

function normalizeHr(row: Record<string, unknown>): HrEmployee {
  return {
    id: String(row.id),
    employee_code: String(row.employee_code || ''),
    full_name: String(row.full_name || ''),
    email: String(row.email || ''),
    job_title: String(row.job_title || ''),
    department: String(row.department || ''),
    employment_status: String(row.employment_status || 'active'),
    start_date: (row.start_date as string | null) ?? null,
    basic_salary_aed: row.basic_salary_aed == null ? null : Number(row.basic_salary_aed),
    allowances_aed: Number(row.allowances_aed || 0),
    iban: String(row.iban || ''),
    labour_card_no: String(row.labour_card_no || ''),
    bank_routing_code: String(row.bank_routing_code || ''),
    notes: String(row.notes || ''),
    reports_to_id: (row.reports_to_id as string | null) ?? null,
    deleted_at: (row.deleted_at as string | null) ?? null,
  }
}

export async function softDeleteHrEmployee(id: string): Promise<void> {
  const { error } = await db
    .from('hr_employees')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreHrEmployee(id: string): Promise<void> {
  const { error } = await db
    .from('hr_employees')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function createHrEmployee(input: {
  full_name: string
  email?: string
  job_title?: string
  department?: string
  employee_code?: string
  basic_salary_aed?: number | null
  allowances_aed?: number
  iban?: string
  labour_card_no?: string
  bank_routing_code?: string
  start_date?: string | null
  employment_status?: string
  reports_to_id?: string | null
}): Promise<void> {
  const code = (input.employee_code || `E${Date.now().toString().slice(-6)}`).trim()
  const { error } = await db.from('hr_employees').insert({
    full_name: input.full_name.trim(),
    email: (input.email || '').trim(),
    job_title: (input.job_title || '').trim(),
    department: (input.department || '').trim(),
    employee_code: code,
    basic_salary_aed: input.basic_salary_aed ?? null,
    allowances_aed: input.allowances_aed ?? 0,
    iban: (input.iban || '').trim(),
    labour_card_no: (input.labour_card_no || '').trim(),
    bank_routing_code: (input.bank_routing_code || '').trim(),
    start_date: input.start_date || null,
    employment_status: input.employment_status || 'active',
    reports_to_id: input.reports_to_id || null,
  })
  if (error) throw error
}

export async function updateHrEmployee(
  id: string,
  patch: Partial<{
    full_name: string
    email: string
    job_title: string
    department: string
    employee_code: string
    employment_status: string
    basic_salary_aed: number | null
    allowances_aed: number
    iban: string
    labour_card_no: string
    bank_routing_code: string
    start_date: string | null
    notes: string
    reports_to_id: string | null
  }>,
): Promise<void> {
  const { error } = await db
    .from('hr_employees')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

//------------------------------------------------------------
// Payroll
//------------------------------------------------------------

export async function listPayrollRuns(): Promise<PayrollRun[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('payroll_runs').select('*').order('period_yyyy_mm', { ascending: false })
    if (error) throw error
    return (data || []) as PayrollRun[]
  }, [])
}

export async function createPayrollRun(periodYyyyMm: string, createdBy?: string | null): Promise<string> {
  const { data, error } = await db
    .from('payroll_runs')
    .insert({
      period_yyyy_mm: periodYyyyMm,
      status: 'draft',
      created_by: createdBy || null,
    })
    .select('id')
    .single()
  if (error) throw error
  return String(data.id)
}

export async function listPayrollLines(runId: string): Promise<PayrollLine[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db
      .from('payroll_lines')
      .select('*, hr_employees(employee_code, full_name, iban, labour_card_no, bank_routing_code)')
      .eq('run_id', runId)
      .order('created_at')
    if (error) throw error
    return (data || []) as PayrollLine[]
  }, [])
}

export async function generatePayrollLinesFromHr(runId: string): Promise<number> {
  const people = await listHrEmployees('active')
  if (!people.length) return 0
  const rows = people.map((p) => {
    const basic = Number(p.basic_salary_aed || 0)
    const allowances = Number(p.allowances_aed || 0)
    const deductions = 0
    const net = payrollNetAed(basic, allowances, deductions)
    const years = yearsOfServiceFromStart(p.start_date)
    const gratuity = draftGratuityAccrualAed({
      yearsOfService: years,
      dailyWageAed: dailyWageFromBasicMonthly(basic),
    })
    return {
      run_id: runId,
      employee_id: p.id,
      basic_aed: basic,
      allowances_aed: allowances,
      deductions_aed: deductions,
      net_aed: net,
      gratuity_accrual_aed: gratuity,
      wps_ready: Boolean(p.iban && p.labour_card_no && p.bank_routing_code && net > 0),
    }
  })
  const { error } = await db.from('payroll_lines').upsert(rows, { onConflict: 'run_id,employee_id' })
  if (error) throw error
  return rows.length
}

export async function updatePayrollLine(
  id: string,
  patch: Partial<{ basic_aed: number; allowances_aed: number; deductions_aed: number }>,
): Promise<void> {
  const { data: existing, error: readErr } = await db
    .from('payroll_lines')
    .select('*, hr_employees(iban, labour_card_no, bank_routing_code)')
    .eq('id', id)
    .single()
  if (readErr) throw readErr
  const basic = patch.basic_aed ?? Number(existing.basic_aed)
  const allowances = patch.allowances_aed ?? Number(existing.allowances_aed)
  const deductions = patch.deductions_aed ?? Number(existing.deductions_aed)
  const net = payrollNetAed(basic, allowances, deductions)
  const emp = (existing as PayrollLine).hr_employees
  const wpsReady = Boolean(emp?.iban && emp?.labour_card_no && emp?.bank_routing_code && net > 0)
  const { error } = await db
    .from('payroll_lines')
    .update({
      basic_aed: basic,
      allowances_aed: allowances,
      deductions_aed: deductions,
      net_aed: net,
      wps_ready: wpsReady,
    })
    .eq('id', id)
  if (error) throw error
}

export async function setPayrollRunStatus(
  runId: string,
  status: 'draft' | 'pending_approval' | 'approved' | 'paid' | 'void',
  approvedBy?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === 'approved' || status === 'paid') {
    patch.approved_by = approvedBy || null
  }
  const { error } = await db.from('payroll_runs').update(patch).eq('id', runId)
  if (error) throw error
}

export async function submitPayrollForApproval(
  runId: string,
  requestedBy?: string | null,
): Promise<{ needsApproval: boolean; totalNet: number }> {
  const lines = await listPayrollLines(runId)
  const totalNet = lines.reduce((s, l) => s + Number(l.net_aed || 0), 0)
  if (!approvalNeedsChecker(totalNet)) {
    await setPayrollRunStatus(runId, 'approved', requestedBy)
    return { needsApproval: false, totalNet }
  }
  await requestApproval({
    objectType: 'payroll_run',
    objectId: runId,
    action: 'approve_payroll',
    amountAed: totalNet,
    requestedBy,
  })
  await setPayrollRunStatus(runId, 'pending_approval')
  return { needsApproval: true, totalNet }
}

//------------------------------------------------------------
// Marketing
//------------------------------------------------------------

export async function listMarketingCampaigns(status?: string): Promise<MarketingCampaign[]> {
  return emptyOnMissing(async () => {
    let q = db.from('marketing_campaigns').select('*').order('created_at', { ascending: false })
    if (status && status !== 'all') q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return (data || []) as MarketingCampaign[]
  }, [])
}

export async function createMarketingCampaign(input: {
  name: string
  channel?: string
  budget_aed?: number | null
  starts_on?: string | null
  ends_on?: string | null
  notes?: string
}): Promise<void> {
  const { error } = await db.from('marketing_campaigns').insert({
    name: input.name.trim(),
    channel: input.channel || 'email',
    status: 'draft',
    budget_aed: input.budget_aed ?? null,
    starts_on: input.starts_on || null,
    ends_on: input.ends_on || null,
    notes: input.notes || '',
  })
  if (error) throw error
}

export async function updateMarketingCampaign(
  id: string,
  patch: Partial<{
    name: string
    channel: string
    status: string
    budget_aed: number | null
    starts_on: string | null
    ends_on: string | null
    notes: string
  }>,
): Promise<void> {
  const { error } = await db
    .from('marketing_campaigns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

//------------------------------------------------------------
// SaaS billing
//------------------------------------------------------------

export async function getTenantSubscription(): Promise<TenantSubscription | null> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('tenant_subscriptions').select('*').maybeSingle()
    if (error) throw error
    return (data as TenantSubscription) || null
  }, null)
}

export async function upsertTenantSubscription(
  planKey: string,
  seats: number,
  status: SaasSubscriptionStatus = 'trialing',
): Promise<void> {
  const plan = planByKey(planKey)
  const seatCount = seats || plan?.seatsIncluded || 5
  const periodEnd = new Date()
  periodEnd.setMonth(periodEnd.getMonth() + 1)
  const existing = await getTenantSubscription()
  if (existing) {
    const { error } = await db
      .from('tenant_subscriptions')
      .update({
        plan_key: planKey,
        seats: seatCount,
        status,
        current_period_end: periodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) throw error
    return
  }
  const { error } = await db.from('tenant_subscriptions').insert({
    plan_key: planKey,
    seats: seatCount,
    status,
    current_period_end: periodEnd.toISOString(),
  })
  if (error) throw error
}

export async function transitionTenantSubscription(
  action: 'activate' | 'cancel' | 'mark_past_due' | 'resume_trial',
): Promise<void> {
  const existing = await getTenantSubscription()
  if (!existing) throw new Error('No subscription to update')
  const next = nextSubscriptionStatus(existing.status as SaasSubscriptionStatus, action)
  if (!next) throw new Error(`Cannot ${action} from ${existing.status}`)
  const { error } = await db
    .from('tenant_subscriptions')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) throw error
}

//------------------------------------------------------------
// Industry packs
//------------------------------------------------------------

export async function listIndustryPackCatalog(): Promise<
  Array<{ id?: string; pack_key: string; name: string; description: string; version: string }>
> {
  return emptyOnMissing(async () => {
    const { data, error } = await db
      .from('industry_packs')
      .select('id, pack_key, name, description, version')
      .eq('active', true)
    if (error) throw error
    if (data?.length) return data
    return BUILTIN_INDUSTRY_PACKS.map(({ pack_key, name, description, version }) => ({
      pack_key,
      name,
      description,
      version,
    }))
  }, BUILTIN_INDUSTRY_PACKS.map(({ pack_key, name, description, version }) => ({
    pack_key,
    name,
    description,
    version,
  })))
}

export async function listTenantIndustryPacks(): Promise<TenantIndustryPackRow[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db
      .from('tenant_industry_packs')
      .select('id, pack_id, status, activated_at, industry_packs(pack_key, name, description, version)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as TenantIndustryPackRow[]
  }, [])
}

export async function activateIndustryPack(
  packKey: string,
): Promise<{ enabledFlags: string[]; fieldsCreated: number; pipelinesCreated: number }> {
  const { data: pack, error: packErr } = await db
    .from('industry_packs')
    .select('id, manifest')
    .eq('pack_key', packKey)
    .maybeSingle()
  if (packErr) throw packErr
  if (!pack?.id) throw new Error(`Pack ${packKey} not found in catalog (run migration)`)

  const { data: existing } = await db
    .from('tenant_industry_packs')
    .select('id, status')
    .eq('pack_id', pack.id)
    .maybeSingle()

  if (existing) {
    const next = nextTenantPackStatus(existing.status as TenantPackStatus, 'activate')
    if (!next) throw new Error('Pack cannot be activated from current status')
    const { error } = await db
      .from('tenant_industry_packs')
      .update({ status: next, activated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await db.from('tenant_industry_packs').insert({
      pack_id: pack.id,
      status: 'active',
      activated_at: new Date().toISOString(),
    })
    if (error) throw error
  }

  const builtin = BUILTIN_INDUSTRY_PACKS.find((p) => p.pack_key === packKey)
  const manifest = (pack.manifest as IndustryPackManifest) || builtin?.manifest || {}
  const flags = await applyPackModuleFlags({ manifest })
  const applied = await applyPackTemplates(manifest)
  return { ...flags, ...applied }
}

/** Idempotently create custom fields / pipelines from pack manifest.templates. */
async function applyPackTemplates(
  manifest: IndustryPackManifest | Record<string, unknown>,
): Promise<{ fieldsCreated: number; pipelinesCreated: number }> {
  const { templatesFromManifest, fieldKeysToCreate, pipelineNamesToCreate } = await import('./industryPackTemplates')
  const templates = templatesFromManifest(manifest)
  let fieldsCreated = 0
  let pipelinesCreated = 0

  const fields = templates.custom_fields || []
  if (fields.length) {
    const { data: existingDefs } = await db
      .from('custom_field_definitions')
      .select('object_type, field_key')
    const existing = new Set(
      ((existingDefs || []) as Array<{ object_type: string; field_key: string }>).map(
        (r) => `${r.object_type}:${r.field_key}`,
      ),
    )
    const toCreate = fieldKeysToCreate(fields, existing)
    for (const f of toCreate) {
      const { error } = await db.from('custom_field_definitions').insert({
        object_type: f.object_type,
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type || 'text',
        options: f.options || [],
      })
      if (!error) fieldsCreated += 1
    }
  }

  const pipelines = templates.pipelines || []
  if (pipelines.length) {
    const { data: existingPipes } = await db.from('pipelines').select('name')
    const existingNames = new Set(
      ((existingPipes || []) as Array<{ name: string }>).map((p) => String(p.name || '').trim().toLowerCase()),
    )
    const toCreate = pipelineNamesToCreate(pipelines, existingNames)
    for (const p of toCreate) {
      const pipelineKey = String(p.name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 48) || 'pack_pipeline'
      const { data: created, error } = await db
        .from('pipelines')
        .insert({
          pipeline_key: pipelineKey,
          name: p.name,
          object_type: p.object_type || 'deal',
          active: true,
        })
        .select('id')
        .maybeSingle()
      if (error || !created?.id) continue
      pipelinesCreated += 1
      const stages = p.stages || []
      for (let i = 0; i < stages.length; i++) {
        const label = stages[i]
        const stageKey =
          String(label || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 48) || `stage_${i + 1}`
        const outcome = /won/i.test(label) ? 'won' : /lost/i.test(label) ? 'lost' : 'open'
        await db.from('pipeline_stages').insert({
          pipeline_id: created.id,
          stage_key: stageKey,
          label,
          outcome,
          sort_order: i + 1,
        })
      }
    }
  }

  return { fieldsCreated, pipelinesCreated }
}

/** Enable shell modules listed in a pack manifest via app_settings.moduleFlags. */
async function applyPackModuleFlags(pack: {
  manifest: IndustryPackManifest
}): Promise<{ enabledFlags: string[] }> {
  const { data: row } = await db
    .from('app_settings')
    .select('value')
    .eq('key', MODULE_FLAGS_KEY)
    .maybeSingle()
  const current = parseModuleFlags({ [MODULE_FLAGS_KEY]: row?.value })
  const { flags, enabled } = applyPackFlagsToMap(current, pack)
  if (!enabled.length) return { enabledFlags: [] }
  const serialized = serializeModuleFlags(flags)
  const { error } = await db
    .from('app_settings')
    .upsert({ key: MODULE_FLAGS_KEY, value: serialized }, { onConflict: 'key' })
  if (error) throw error
  return { enabledFlags: enabled }
}

export async function retireIndustryPack(packKey: string): Promise<void> {
  const { data: pack, error: packErr } = await db
    .from('industry_packs')
    .select('id')
    .eq('pack_key', packKey)
    .maybeSingle()
  if (packErr) throw packErr
  if (!pack?.id) throw new Error(`Pack ${packKey} not found`)

  const { data: existing } = await db
    .from('tenant_industry_packs')
    .select('id, status')
    .eq('pack_id', pack.id)
    .maybeSingle()
  if (!existing) throw new Error('Pack is not activated for this tenant')

  const next = nextTenantPackStatus(existing.status as TenantPackStatus, 'retire')
  if (!next) throw new Error('Pack already retired')
  const { error } = await db.from('tenant_industry_packs').update({ status: next }).eq('id', existing.id)
  if (error) throw error
}

//------------------------------------------------------------
// Approvals (maker-checker)
//------------------------------------------------------------

export async function listApprovals(status: string = 'pending'): Promise<ApprovalRequest[]> {
  return emptyOnMissing(async () => {
    let q = db.from('approval_requests').select('*').order('created_at', { ascending: false })
    if (status !== 'all') q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return (data || []) as ApprovalRequest[]
  }, [])
}

export async function requestApproval(input: {
  objectType: string
  objectId: string
  action: string
  amountAed?: number | null
  requestedBy?: string | null
}): Promise<void> {
  const summary = summarizeApproval({
    objectType: input.objectType,
    action: input.action,
    amountAed: input.amountAed,
  })
  const { error } = await db.from('approval_requests').insert({
    object_type: input.objectType,
    object_id: input.objectId,
    action: input.action,
    amount_aed: input.amountAed ?? null,
    summary,
    requested_by: input.requestedBy || null,
    status: 'pending',
  })
  if (error) throw error
}

export async function decideApproval(
  id: string,
  status: 'approved' | 'rejected' | 'canceled',
  decidedBy?: string | null,
  note = '',
): Promise<void> {
  const { data: row, error: readErr } = await db.from('approval_requests').select('*').eq('id', id).single()
  if (readErr) throw readErr
  const decision =
    status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'cancel'
  if (
    !canDecideApproval({
      status: row.status as ApprovalStatus,
      requestedBy: row.requested_by,
      decidedBy,
      decision,
    })
  ) {
    throw new Error(
      row.requested_by && decidedBy && row.requested_by === decidedBy && status !== 'canceled'
        ? 'Maker cannot approve their own request'
        : 'Request is not pending',
    )
  }

  const { error } = await db
    .from('approval_requests')
    .update({
      status,
      decided_by: decidedBy || null,
      decision_note: note,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
  if (error) throw error

  if (status === 'approved' && row.object_type === 'payroll_run') {
    await setPayrollRunStatus(String(row.object_id), 'approved', decidedBy)
  }
  if (status === 'rejected' && row.object_type === 'payroll_run') {
    await setPayrollRunStatus(String(row.object_id), 'draft')
  }

  const objectId = String(row.object_id)
  const now = new Date().toISOString()
  if (row.object_type === 'customer_refund') {
    if (status === 'approved') {
      await db
        .from('customer_refunds')
        .update({
          status: 'Refunded',
          approved_by: decidedBy || null,
          approved_at: now,
        })
        .eq('id', objectId)
    } else if (status === 'rejected' || status === 'canceled') {
      await db.from('customer_refunds').update({ status: 'Canceled' }).eq('id', objectId)
    }
  }
  if (row.object_type === 'supplier_commitment') {
    if (status === 'approved') {
      await db.from('supplier_commitments').update({ status: 'Open' }).eq('id', objectId)
    } else if (status === 'rejected' || status === 'canceled') {
      await db.from('supplier_commitments').update({ status: 'Canceled' }).eq('id', objectId)
    }
  }
  if (row.object_type === 'expense') {
    if (status === 'approved') {
      await db.from('expenses').update({ status: 'Recorded' }).eq('id', objectId)
    } else if (status === 'rejected' || status === 'canceled') {
      await db.from('expenses').update({ status: 'Canceled' }).eq('id', objectId)
    }
  }
}

/** Latest approval status for an object (pending preferred over older terminals). */
export async function latestApprovalStatus(
  objectType: string,
  objectId: string,
): Promise<ApprovalStatus | null> {
  return emptyOnMissing(async () => {
    const { data, error } = await db
      .from('approval_requests')
      .select('status')
      .eq('object_type', objectType)
      .eq('object_id', objectId)
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw error
    const rows = (data || []) as Array<{ status: string }>
    const pending = rows.find((r) => r.status === 'pending')
    if (pending) return 'pending'
    const approved = rows.find((r) => r.status === 'approved')
    if (approved) return 'approved'
    if (!rows.length) return null
    return rows[0].status as ApprovalStatus
  }, null)
}

/**
 * Gate a money action and optionally open a maker-checker request.
 * Returns whether the caller may proceed (approved / under threshold).
 */
export async function ensureMoneyApproval(input: {
  objectType: string
  objectId: string
  action: string
  amountAed: number
  requestedBy?: string | null
}): Promise<{ proceed: boolean; needsApproval: boolean; reason?: string }> {
  const existing = await latestApprovalStatus(input.objectType, input.objectId)
  const gate = gateMoneyAction({ amountAed: input.amountAed, existingStatus: existing })
  if (!gate.ok) {
    return { proceed: false, needsApproval: true, reason: gate.reason }
  }
  if (!gate.needsApproval) {
    return { proceed: true, needsApproval: false }
  }
  // Open a new request when none pending/approved
  if (existing !== 'pending') {
    await requestApproval({
      objectType: input.objectType,
      objectId: input.objectId,
      action: input.action,
      amountAed: input.amountAed,
      requestedBy: input.requestedBy,
    })
  }
  return { proceed: false, needsApproval: true, reason: gate.reason }
}

//------------------------------------------------------------
// Public API keys + webhooks
//------------------------------------------------------------

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db
      .from('api_keys')
      .select('id, name, key_prefix, scopes, revoked_at, last_used_at, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as ApiKeyRow[]
  }, [])
}

export async function createApiKey(
  name: string,
  createdBy?: string | null,
  scopes: string[] = DEFAULT_API_KEY_SCOPES,
): Promise<{ plaintext: string; prefix: string }> {
  const plaintext = `hm_${crypto.randomUUID().replace(/-/g, '')}`
  const prefix = plaintext.slice(0, 10)
  const keyHash = await sha256Hex(plaintext)
  const { error } = await db.from('api_keys').insert({
    name: name.trim() || 'API key',
    key_prefix: prefix,
    key_hash: keyHash,
    scopes,
    created_by: createdBy || null,
  })
  if (error) throw error
  return { plaintext, prefix }
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await db
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
  if (error) throw error
}

export async function listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db
      .from('webhook_endpoints')
      .select('id, url, active, event_types, last_delivery_at, last_delivery_status, delivery_failures, next_retry_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as WebhookEndpoint[]
  }, [])
}

export async function createWebhookEndpoint(url: string, eventTypes: string[] = ['*']): Promise<void> {
  const secret = `whsec_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const { error } = await db.from('webhook_endpoints').insert({
    url: url.trim(),
    active: true,
    event_types: eventTypes,
    secret,
  })
  if (error) throw error
}

export async function setWebhookActive(id: string, active: boolean): Promise<void> {
  const { error } = await db
    .from('webhook_endpoints')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Signed outbound ping with retries; records status on the endpoint row. */
export async function testWebhookDelivery(id: string): Promise<{ ok: boolean; status: string; attempts: number }> {
  const { data: hook, error: readErr } = await db.from('webhook_endpoints').select('*').eq('id', id).single()
  if (readErr) throw readErr
  const payload = {
    type: 'highmast.test',
    sent_at: new Date().toISOString(),
    message: 'HighMast webhook test event',
  }
  const body = JSON.stringify(payload)
  const headers = await buildSignedWebhookHeaders(String(hook.secret || 'whsec_missing'), body, 'highmast.test')
  const result = await deliverWebhookWithRetries({
    url: String(hook.url),
    body,
    headers,
    maxAttempts: 3,
  })
  const patch: Record<string, unknown> = {
    last_delivery_at: new Date().toISOString(),
    last_delivery_status: `${result.status}×${result.attempts}`,
    updated_at: new Date().toISOString(),
    delivery_failures: result.ok ? 0 : Number(hook.delivery_failures || 0) + 1,
    next_retry_at: result.ok ? null : new Date(Date.now() + 60_000).toISOString(),
  }
  await db.from('webhook_endpoints').update(patch).eq('id', id)
  try {
    await db.from('webhook_delivery_attempts').insert({
      endpoint_id: id,
      event_type: 'highmast.test',
      attempt: result.attempts,
      status: result.status,
    })
  } catch {
    /* table may not be migrated yet */
  }
  return result
}

export function publicApiConfigured(): boolean {
  return isSupabaseConfigured()
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
