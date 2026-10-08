import { db, currentAuthMode } from './db'
import { exportLocalDump } from './localDb'
import { downloadJson } from './uiStyles'

const CLOUD_TABLES = [
  'app_users',
  'app_settings',
  'clients',
  'vendors',
  'owned_domains',
  'crm',
  'follow_up_updates',
  'quotations',
  'invoices',
  'line_items',
  'products',
  'quote_templates',
  'income',
  'expenses',
  'payment_log',
  'attachments',
  'customer_documents',
  'company_documents',
  'activity_log',
  'delivery_notes',
  'inventory_movements',
  'customer_payments',
  'customer_refunds',
  'supplier_commitments',
  'fx_rates',
  'wanders_deals',
  'website_inquiries',
] as const

/** Download a JSON backup of local IndexedDB or cloud Postgres tables. */
export async function downloadCentralBackup(): Promise<{ mode: 'local' | 'supabase'; rows: number }> {
  const stamp = new Date().toISOString().slice(0, 10)
  if (currentAuthMode() === 'local') {
    const dump = await exportLocalDump()
    let rows = 0
    for (const value of Object.values(dump)) {
      if (Array.isArray(value)) rows += value.length
    }
    downloadJson(`rrcentral-backup-${stamp}.json`, dump)
    return { mode: 'local', rows }
  }

  const dump: Record<string, unknown> = {}
  let rows = 0
  for (const table of CLOUD_TABLES) {
    const { data, error } = await db.from(table).select('*')
    if (error) {
      if (/does not exist|Could not find the table|relation/i.test(error.message)) continue
      throw error
    }
    const list = (data || []) as unknown[]
    dump[table] = list
    rows += list.length
  }
  dump._meta = {
    exported_at: new Date().toISOString(),
    source: 'supabase',
    tables: Object.keys(dump).filter((k) => k !== '_meta'),
  }
  downloadJson(`rrcentral-cloud-backup-${stamp}.json`, dump)
  return { mode: 'supabase', rows }
}
