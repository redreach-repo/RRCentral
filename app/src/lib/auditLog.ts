import { db, currentAuthMode } from './db'

/** Row written by the rr_audit database trigger (see supabase/migrations/*_audit_log.sql). */
export type AuditEntry = {
  id: number
  table_name: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  row_id: string
  actor_email: string
  changed_fields: string[]
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
  /** Account the changed record belongs to (generated from the data). */
  account_id?: string | null
}

export type AuditFilters = {
  table?: string
  actor?: string
  operation?: AuditEntry['operation'] | ''
  /** Only changes in this focus group (contracts, prices, commission). */
  focus?: AuditFocus | ''
  /** Only changes to records that belong to this account. */
  accountId?: string
  /** That account's CTRM deal ids, so commission changes show in its history. */
  accountDealIds?: string[]
  /** Only changes on or after this ISO time. */
  since?: string
  limit?: number
}

export type FieldChange = { field: string; before: string; after: string }

/** Human labels for audited tables. */
export const AUDIT_TABLE_LABELS: Record<string, string> = {
  app_users: 'Users',
  app_settings: 'Settings',
  clients: 'Clients',
  vendors: 'Vendors',
  crm: 'CRM',
  quotations: 'Quotations',
  invoices: 'Invoices',
  delivery_notes: 'Delivery notes',
  products: 'Catalog',
  income: 'Income',
  expenses: 'Expenses',
  payment_log: 'Payments',
  customer_payments: 'Customer payments',
  customer_refunds: 'Refunds',
  supplier_commitments: 'Supplier commitments',
  wanders_deals: 'Wanders deals',
  customer_bookings: 'Bookings',
  customer_documents: 'Customer files',
  quote_templates: 'Templates',
  company_documents: 'Company documents',
  owned_domains: 'Domains',
  attachments: 'Attachments',
  accounts: 'Accounts',
  account_contacts: 'Account contacts',
  account_activities: 'Account timeline',
  delivery_packages: 'Packages',
  contracts: 'Contracts',
  build_stages: 'Build stages',
  requirements: 'Requirements',
  time_entries: 'Hours',
  usage_records: 'Usage',
  sla_policies: 'Support response times',
  tickets: 'Tickets',
  ticket_messages: 'Ticket messages',
  ctrm_deals: 'CTRM deals',
  ctrm_deal_stage_changes: 'CTRM stage changes',
  ctrm_deal_commissions: 'CTRM commission',
  worship_church_profiles: 'WorshipHub churches',
  contract_invoices: 'Contract invoices',
  invoice_reminders: 'Payment reminders',
  usage_sources: 'Usage import sources',
  digest_recipients: 'Daily digest list',
  sales_deals: 'AI CRM sales deals',
  portal_access: 'Client portal links',
  build_templates: 'Build templates',
  build_template_items: 'Build template lines',
  build_tasks: 'Build checklist',
  line_items: 'Quote and invoice lines',
  tour_packages: 'Tour packages',
  package_cost_components: 'Tour package costs',
  package_selling_prices: 'Tour package prices',
  scheduled_departures: 'Departures',
  wanders_partners: 'Wanders partners',
  fx_rates: 'Exchange rates',
}

export type AuditFocus = 'contracts' | 'prices' | 'commission'

/** The changes Alfred most wants to see: who touched contracts, prices and commission. */
export const AUDIT_FOCUS: Record<AuditFocus, { label: string; tables: string[] }> = {
  contracts: { label: 'Contracts', tables: ['contracts', 'contract_invoices', 'sales_deals'] },
  prices: {
    label: 'Prices',
    tables: [
      'delivery_packages',
      'app_settings',
      'products',
      'line_items',
      'quote_templates',
      'tour_packages',
      'package_cost_components',
      'package_selling_prices',
      'fx_rates',
    ],
  },
  commission: { label: 'Commission', tables: ['ctrm_deal_commissions'] },
}

/** Settings that set prices or rates (the delivery overage and costing rates, VAT). */
export function isPriceSetting(key: string): boolean {
  return (key.startsWith('delivery') && /Rate|Markup|UsdToAed|Cost/.test(key)) || key === 'vatRate'
}

/** Which focus group an entry belongs to, if any. */
export function auditFocusOf(entry: Pick<AuditEntry, 'table_name' | 'row_id'>): AuditFocus | null {
  if (entry.table_name === 'app_settings') return isPriceSetting(entry.row_id) ? 'prices' : null
  for (const [focus, group] of Object.entries(AUDIT_FOCUS) as [AuditFocus, { tables: string[] }][]) {
    if (group.tables.includes(entry.table_name)) return focus
  }
  return null
}

const FIELD_LABELS: Record<string, string> = {
  monthly_fee: 'Monthly fee',
  setup_fee: 'Setup fee',
  setup_fee_paid: 'Setup fee paid',
  monthly_fee_a: 'Monthly fee (option A)',
  monthly_fee_b: 'Monthly fee (option B)',
  setup_fee_b: 'Setup fee (option B)',
  discount_percent: 'Discount %',
  discount_months_left: 'Discount months left',
  term_start: 'Term start',
  term_end: 'Term end',
  package_id: 'Package',
  annual_prepay: 'Paid yearly',
  auto_invoice: 'Invoices raised automatically',
  billing_from: 'Billing from',
  expected_commission: 'Expected commission',
  commission_received: 'Commission received',
  unit_price: 'Unit price',
  total_amount: 'Total',
  est_hours: 'Estimated hours',
}

/** A readable name for a database field. */
export function auditFieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  const words = field.replace(/_id$/, '').replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : field
}

/** Fields that identify a record better than its UUID, in preference order. */
const LABEL_FIELDS = [
  'reference_number',
  'company_name',
  'client',
  'vendor',
  'name',
  'email',
  'key',
  'title',
  'sku',
]

export function auditRecordLabel(entry: Pick<AuditEntry, 'new_data' | 'old_data' | 'row_id'>): string {
  const data = entry.new_data || entry.old_data || {}
  for (const field of LABEL_FIELDS) {
    const value = data[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return entry.row_id ? entry.row_id.slice(0, 8) : '—'
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Before/after pairs for an UPDATE (empty for inserts/deletes). */
export function auditFieldChanges(entry: Pick<AuditEntry, 'changed_fields' | 'old_data' | 'new_data'>): FieldChange[] {
  const before = entry.old_data || {}
  const after = entry.new_data || {}
  return (entry.changed_fields || []).map((field) => ({
    field,
    before: show(before[field]),
    after: show(after[field]),
  }))
}

export function auditSummary(entry: AuditEntry): string {
  const what = AUDIT_TABLE_LABELS[entry.table_name] || entry.table_name
  const label = auditRecordLabel(entry)
  if (entry.operation === 'INSERT') return `Created ${what}: ${label}`
  if (entry.operation === 'DELETE') return `Deleted ${what}: ${label}`
  const fields = entry.changed_fields || []
  const list = fields.length > 3 ? `${fields.slice(0, 3).join(', ')} +${fields.length - 3}` : fields.join(', ')
  return `Updated ${what}: ${label}${list ? ` (${list})` : ''}`
}

/** The shown entries as CSV, one row per changed field, for keeping or sending to an accountant. */
export function auditCsvRows(entries: AuditEntry[]): string[][] {
  const out: string[][] = [['When', 'Who', 'Action', 'Record type', 'Record', 'Field', 'Before', 'After']]
  for (const e of entries) {
    const base = [e.created_at, e.actor_email, e.operation, AUDIT_TABLE_LABELS[e.table_name] || e.table_name, auditRecordLabel(e)]
    const changes = auditFieldChanges(e)
    if (!changes.length) out.push([...base, '', '', ''])
    for (const c of changes) out.push([...base, auditFieldLabel(c.field), c.before, c.after])
  }
  return out
}

export function isAuditAvailable(): boolean {
  return currentAuthMode() === 'supabase'
}

export async function loadAuditLog(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  if (!isAuditAvailable()) return []
  let query = db
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(filters.limit || 200, 1000))
  if (filters.table) query = query.eq('table_name', filters.table)
  else if (filters.focus) query = query.in('table_name', AUDIT_FOCUS[filters.focus].tables)
  if (filters.since) query = query.gte('created_at', filters.since)
  if (filters.accountId) {
    const id = filters.accountId.replace(/[^0-9a-f-]/gi, '')
    // The account itself, its own records, and commission on its CTRM deals (linked by deal).
    const dealIds = (filters.accountDealIds || []).map((d) => d.replace(/[^0-9a-f-]/gi, '')).filter(Boolean)
    const parts = [`row_id.eq.${id}`, `account_id.eq.${id}`]
    if (dealIds.length) parts.push(`new_data->>deal_id.in.(${dealIds.join(',')})`, `old_data->>deal_id.in.(${dealIds.join(',')})`)
    query = query.or(parts.join(','))
  }
  if (filters.operation) query = query.eq('operation', filters.operation)
  if (filters.actor) query = query.ilike('actor_email', `%${filters.actor.replace(/[\\%_]/g, '\\$&')}%`)
  const { data, error } = await query
  if (error) throw error
  const rows = (data || []) as AuditEntry[]
  // Settings other than prices and rates are not part of the Prices view.
  return filters.focus && !filters.table ? rows.filter((r) => auditFocusOf(r) === filters.focus) : rows
}
