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
}

export type AuditFilters = {
  table?: string
  actor?: string
  operation?: AuditEntry['operation'] | ''
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
  if (filters.operation) query = query.eq('operation', filters.operation)
  if (filters.actor) query = query.ilike('actor_email', `%${filters.actor.replace(/[\\%_]/g, '\\$&')}%`)
  const { data, error } = await query
  if (error) throw error
  return (data || []) as AuditEntry[]
}
