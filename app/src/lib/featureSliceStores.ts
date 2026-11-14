/**
 * Supabase stores for M6–M12 feature slices.
 * Missing-table errors surface as empty lists so local mode stays usable.
 */
import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import {
  BUILTIN_INDUSTRY_PACKS,
  nextTenantPackStatus,
  type TenantPackStatus,
} from './industryPacks'
import {
  approvalNeedsChecker,
  canDecideApproval,
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
  notes: string
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
  hr_employees?: Pick<HrEmployee, 'employee_code' | 'full_name' | 'iban'> | null
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

export async function listHrEmployees(status?: string): Promise<HrEmployee[]> {
  return emptyOnMissing(async () => {
    let q = db.from('hr_employees').select('*').order('full_name')
    if (status && status !== 'all') q = q.eq('employment_status', status)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(normalizeHr)
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
    notes: String(row.notes || ''),
  }
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
  start_date?: string | null
  employment_status?: string
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
    start_date: input.start_date || null,
    employment_status: input.employment_status || 'active',
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
    start_date: string | null
    notes: string
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
      .select('*, hr_employees(employee_code, full_name, iban)')
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
      wps_ready: Boolean(p.iban && net > 0),
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
  const { data: existing, error: readErr } = await db.from('payroll_lines').select('*').eq('id', id).single()
  if (readErr) throw readErr
  const basic = patch.basic_aed ?? Number(existing.basic_aed)
  const allowances = patch.allowances_aed ?? Number(existing.allowances_aed)
  const deductions = patch.deductions_aed ?? Number(existing.deductions_aed)
  const net = payrollNetAed(basic, allowances, deductions)
  const { error } = await db
    .from('payroll_lines')
    .update({
      basic_aed: basic,
      allowances_aed: allowances,
      deductions_aed: deductions,
      net_aed: net,
      wps_ready: net > 0,
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

export async function activateIndustryPack(packKey: string): Promise<void> {
  const { data: pack, error: packErr } = await db
    .from('industry_packs')
    .select('id')
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
    return
  }

  const { error } = await db.from('tenant_industry_packs').insert({
    pack_id: pack.id,
    status: 'active',
    activated_at: new Date().toISOString(),
  })
  if (error) throw error
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
  scopes: string[] = ['read:accounts'],
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
      .select('id, url, active, event_types, last_delivery_at, last_delivery_status')
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

/** Best-effort outbound ping; records status on the endpoint row. */
export async function testWebhookDelivery(id: string): Promise<{ ok: boolean; status: string }> {
  const { data: hook, error: readErr } = await db.from('webhook_endpoints').select('*').eq('id', id).single()
  if (readErr) throw readErr
  const payload = {
    type: 'highmast.test',
    sent_at: new Date().toISOString(),
    message: 'HighMast webhook test event',
  }
  let status = 'ok'
  let ok = true
  try {
    const res = await fetch(String(hook.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HighMast-Event': 'highmast.test',
        'X-HighMast-Signature': String(hook.secret || ''),
      },
      body: JSON.stringify(payload),
    })
    status = `http_${res.status}`
    ok = res.ok
  } catch (e) {
    status = e instanceof Error ? `error:${e.message.slice(0, 80)}` : 'error'
    ok = false
  }
  await db
    .from('webhook_endpoints')
    .update({
      last_delivery_at: new Date().toISOString(),
      last_delivery_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { ok, status }
}

export function publicApiConfigured(): boolean {
  return isSupabaseConfigured()
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
