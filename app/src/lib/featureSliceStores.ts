/**
 * Thin Supabase stores for M6–M12 first-slice tables.
 * Missing-table errors surface as empty lists so local mode stays usable.
 */
import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import { BUILTIN_INDUSTRY_PACKS } from './industryPacks'
import { summarizeApproval } from './makerChecker'

export type HrEmployee = {
  id: string
  employee_code: string
  full_name: string
  email: string
  job_title: string
  department: string
  employment_status: string
  basic_salary_aed: number | null
}

export type PayrollRun = {
  id: string
  period_yyyy_mm: string
  status: string
  currency: string
  notes: string
}

export type MarketingCampaign = {
  id: string
  name: string
  channel: string
  status: string
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
  created_at: string
}

export type ApiKeyRow = {
  id: string
  name: string
  key_prefix: string
  scopes: unknown
  revoked_at: string | null
  created_at: string
}

export type WebhookEndpoint = {
  id: string
  url: string
  active: boolean
  event_types: unknown
}

async function emptyOnMissing<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (isMissingRelationError(e)) return fallback
    throw e
  }
}

export async function listHrEmployees(): Promise<HrEmployee[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('hr_employees').select('*').order('full_name')
    if (error) throw error
    return (data || []) as HrEmployee[]
  }, [])
}

export async function createHrEmployee(input: {
  full_name: string
  email?: string
  job_title?: string
  department?: string
  employee_code?: string
}): Promise<void> {
  const code = (input.employee_code || `E${Date.now().toString().slice(-6)}`).trim()
  const { error } = await db.from('hr_employees').insert({
    full_name: input.full_name.trim(),
    email: (input.email || '').trim(),
    job_title: (input.job_title || '').trim(),
    department: (input.department || '').trim(),
    employee_code: code,
  })
  if (error) throw error
}

export async function listPayrollRuns(): Promise<PayrollRun[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('payroll_runs').select('*').order('period_yyyy_mm', { ascending: false })
    if (error) throw error
    return (data || []) as PayrollRun[]
  }, [])
}

export async function createPayrollRun(periodYyyyMm: string): Promise<void> {
  const { error } = await db.from('payroll_runs').insert({
    period_yyyy_mm: periodYyyyMm,
    status: 'draft',
  })
  if (error) throw error
}

export async function listMarketingCampaigns(): Promise<MarketingCampaign[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('marketing_campaigns').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as MarketingCampaign[]
  }, [])
}

export async function createMarketingCampaign(input: {
  name: string
  channel?: string
}): Promise<void> {
  const { error } = await db.from('marketing_campaigns').insert({
    name: input.name.trim(),
    channel: input.channel || 'email',
    status: 'draft',
  })
  if (error) throw error
}

export async function getTenantSubscription(): Promise<TenantSubscription | null> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('tenant_subscriptions').select('*').maybeSingle()
    if (error) throw error
    return (data as TenantSubscription) || null
  }, null)
}

export async function upsertTenantSubscription(planKey: string, seats: number): Promise<void> {
  const existing = await getTenantSubscription()
  if (existing) {
    const { error } = await db
      .from('tenant_subscriptions')
      .update({ plan_key: planKey, seats, status: 'trialing', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
    return
  }
  const { error } = await db.from('tenant_subscriptions').insert({
    plan_key: planKey,
    seats,
    status: 'trialing',
  })
  if (error) throw error
}

export async function listIndustryPackCatalog(): Promise<
  Array<{ pack_key: string; name: string; description: string; version: string }>
> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('industry_packs').select('pack_key, name, description, version').eq('active', true)
    if (error) throw error
    if (data?.length) return data
    return BUILTIN_INDUSTRY_PACKS.map(({ pack_key, name, description, version }) => ({
      pack_key,
      name,
      description,
      version,
    }))
  }, BUILTIN_INDUSTRY_PACKS.map(({ pack_key, name, description, version }) => ({ pack_key, name, description, version })))
}

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
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('api_keys').select('id, name, key_prefix, scopes, revoked_at, created_at').order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as ApiKeyRow[]
  }, [])
}

export async function createApiKey(name: string, createdBy?: string | null): Promise<{ plaintext: string; prefix: string }> {
  const plaintext = `hm_${crypto.randomUUID().replace(/-/g, '')}`
  const prefix = plaintext.slice(0, 10)
  const keyHash = await sha256Hex(plaintext)
  const { error } = await db.from('api_keys').insert({
    name: name.trim() || 'API key',
    key_prefix: prefix,
    key_hash: keyHash,
    created_by: createdBy || null,
  })
  if (error) throw error
  return { plaintext, prefix }
}

export async function listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  return emptyOnMissing(async () => {
    const { data, error } = await db.from('webhook_endpoints').select('id, url, active, event_types').order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as WebhookEndpoint[]
  }, [])
}

export async function createWebhookEndpoint(url: string): Promise<void> {
  const { error } = await db.from('webhook_endpoints').insert({
    url: url.trim(),
    active: true,
    event_types: ['*'],
  })
  if (error) throw error
}

export function publicApiConfigured(): boolean {
  return isSupabaseConfigured()
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
