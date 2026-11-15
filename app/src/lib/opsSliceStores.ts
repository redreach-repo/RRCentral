/**
 * Stores for M8–M9a slices (country packs, POs, projects, client POs, payroll exports).
 */
import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import { BUILTIN_COUNTRY_PACKS, type CountryPack } from './countryPacks'
import { nextPoNumber } from './purchasing'

export async function listCountryPacks(): Promise<CountryPack[]> {
  if (!isSupabaseConfigured()) return BUILTIN_COUNTRY_PACKS
  const { data, error } = await db
    .from('country_packs')
    .select('pack_key, name, country_code, currency, description, version, rules')
    .order('country_code')
  if (error) {
    if (isMissingRelationError(error)) return BUILTIN_COUNTRY_PACKS
    throw error
  }
  if (!data?.length) return BUILTIN_COUNTRY_PACKS
  return data.map((r: {
    pack_key: string
    name: string
    country_code: string
    currency: string
    description: string
    version: string
    rules: CountryPack['rules'] | null
  }) => ({
    pack_key: r.pack_key,
    name: r.name,
    country_code: r.country_code,
    currency: r.currency,
    description: r.description,
    version: r.version,
    rules: (r.rules || {}) as CountryPack['rules'],
  }))
}

export async function activateCountryPack(packKey: string): Promise<void> {
  const { data: pack, error: pErr } = await db.from('country_packs').select('id').eq('pack_key', packKey).maybeSingle()
  if (pErr) throw pErr
  if (!pack) throw new Error('Country pack not found — apply the country_packs migration')
  const { data: existing } = await db.from('tenant_country_packs').select('id').eq('pack_id', pack.id).maybeSingle()
  if (existing) {
    const { error } = await db
      .from('tenant_country_packs')
      .update({ status: 'active', activated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await db.from('tenant_country_packs').insert({
      pack_id: pack.id,
      status: 'active',
      activated_at: new Date().toISOString(),
    })
    if (error) throw error
  }
  const { error: sErr } = await db.from('app_settings').upsert({ key: 'countryPack', value: packKey }, { onConflict: 'key' })
  if (sErr && !isMissingRelationError(sErr)) throw sErr
}

export type PurchaseOrder = {
  id: string
  po_number: string
  vendor_name: string
  status: string
  order_date: string
  currency: string
  notes: string
}

export type PurchaseOrderLine = {
  id: string
  purchase_order_id: string
  line_no: number
  sku: string
  description: string
  qty_ordered: number
  qty_received: number
  unit_cost: number
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('purchase_orders')
    .select('id, po_number, vendor_name, status, order_date, currency, notes')
    .order('order_date', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as PurchaseOrder[]
}

export async function createPurchaseOrder(input: {
  vendorName: string
  orderDate: string
  sku: string
  description: string
  qty: number
  unitCost: number
}): Promise<PurchaseOrder> {
  const existing = await listPurchaseOrders()
  const po_number = nextPoNumber(
    existing.map((p) => p.po_number),
    input.orderDate,
  )
  const { data, error } = await db
    .from('purchase_orders')
    .insert({
      po_number,
      vendor_name: input.vendorName.trim(),
      order_date: input.orderDate,
      status: 'ordered',
      notes: '',
    })
    .select('id, po_number, vendor_name, status, order_date, currency, notes')
    .single()
  if (error) throw error
  const { error: lErr } = await db.from('purchase_order_lines').insert({
    purchase_order_id: data.id,
    line_no: 1,
    sku: input.sku.trim(),
    description: input.description.trim() || input.sku,
    qty_ordered: input.qty,
    qty_received: 0,
    unit_cost: input.unitCost,
  })
  if (lErr) throw lErr
  return data as PurchaseOrder
}

export async function listPoLines(poId: string): Promise<PurchaseOrderLine[]> {
  const { data, error } = await db
    .from('purchase_order_lines')
    .select('id, purchase_order_id, line_no, sku, description, qty_ordered, qty_received, unit_cost')
    .eq('purchase_order_id', poId)
    .order('line_no')
  if (error) throw error
  return (data || []) as PurchaseOrderLine[]
}

export async function receivePoLine(lineId: string, qty: number, userEmail: string): Promise<void> {
  const { error } = await db.rpc('rr_po_receive_line', {
    p_line: lineId,
    p_qty: qty,
    p_user_email: userEmail,
  })
  if (error) throw error
}

export type DeliveryProject = {
  id: string
  code: string
  name: string
  status: string
  account_id: string | null
  budget_aed: number | null
  notes: string
}

export type ProjectCostLine = {
  id: string
  project_id: string
  cost_date: string
  category: string
  description: string
  amount_aed: number
}

export async function listDeliveryProjects(): Promise<DeliveryProject[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('delivery_projects')
    .select('id, code, name, status, account_id, budget_aed, notes')
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as DeliveryProject[]
}

export async function createDeliveryProject(input: {
  code: string
  name: string
  budgetAed?: number | null
}): Promise<void> {
  const { error } = await db.from('delivery_projects').insert({
    code: input.code.trim(),
    name: input.name.trim(),
    status: 'active',
    budget_aed: input.budgetAed ?? null,
  })
  if (error) throw error
}

export async function listProjectCosts(projectId: string): Promise<ProjectCostLine[]> {
  const { data, error } = await db
    .from('project_cost_lines')
    .select('id, project_id, cost_date, category, description, amount_aed')
    .eq('project_id', projectId)
    .order('cost_date', { ascending: false })
  if (error) throw error
  return (data || []) as ProjectCostLine[]
}

export async function addProjectCost(input: {
  projectId: string
  category: string
  description: string
  amountAed: number
  costDate: string
}): Promise<void> {
  const { error } = await db.from('project_cost_lines').insert({
    project_id: input.projectId,
    category: input.category,
    description: input.description.trim(),
    amount_aed: input.amountAed,
    cost_date: input.costDate,
  })
  if (error) throw error
}

export type ClientPurchaseOrder = {
  id: string
  account_id: string
  po_number: string
  status: string
  issued_on: string | null
  currency: string
  amount: number
  notes: string
  accounts?: { name: string } | null
}

export async function listClientPurchaseOrders(): Promise<ClientPurchaseOrder[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('client_purchase_orders')
    .select('id, account_id, po_number, status, issued_on, currency, amount, notes, accounts(name)')
    .order('issued_on', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as ClientPurchaseOrder[]
}

export async function createClientPurchaseOrder(input: {
  accountId: string
  poNumber: string
  amount: number
  currency: string
  issuedOn: string
  notes: string
}): Promise<void> {
  const { error } = await db.from('client_purchase_orders').insert({
    account_id: input.accountId,
    po_number: input.poNumber.trim(),
    amount: input.amount,
    currency: input.currency || 'AED',
    issued_on: input.issuedOn || null,
    notes: input.notes.trim(),
    status: 'open',
  })
  if (error) throw error
}

export async function setClientPoStatus(id: string, status: string): Promise<void> {
  const { error } = await db
    .from('client_purchase_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function logPayrollExport(input: {
  runId: string
  kind: 'wps_csv' | 'wps_sif'
  lineCount: number
  employerId: string
  exportedBy: string | null
}): Promise<void> {
  if (!isSupabaseConfigured()) return
  const masked =
    input.employerId.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, input.employerId.length - 4))}${input.employerId.slice(-4)}`
  const { error } = await db.from('payroll_exports').insert({
    run_id: input.runId,
    export_kind: input.kind,
    line_count: input.lineCount,
    employer_id_masked: masked,
    exported_by: input.exportedBy,
  })
  if (error && !isMissingRelationError(error)) throw error
}
