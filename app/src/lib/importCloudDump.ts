import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { LOCAL_STORES, type MigrationDump } from './localDb'

type Row = Record<string, unknown>

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TEXT_ID_STORES = new Set([
  'tour_packages',
  'wanders_partners',
  'package_cost_components',
  'package_selling_prices',
  'scheduled_departures',
  'customer_bookings',
])

function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

function prepareRows(store: string, rows: Row[]): Row[] {
  if (store === 'app_settings') {
    return rows
      .map((row) => ({
        key: String(row.key || '').trim(),
        value: row.value == null ? '' : String(row.value),
      }))
      .filter((row) => row.key)
  }

  if (store === 'app_users') {
    const byEmail = new Map<string, Row>()
    for (const row of rows) {
      const email = String(row.email || '')
        .trim()
        .toLowerCase()
      if (!email) continue
      const next: Row = {
        email,
        name: String(row.name || email.split('@')[0] || ''),
        role: row.role === 'admin' ? 'admin' : 'sales',
        active: row.active !== false,
      }
      if (isUuid(row.id)) next.id = row.id
      if (row.created_at) next.created_at = row.created_at
      byEmail.set(email, next)
    }
    return [...byEmail.values()]
  }

  return rows.map((row) => {
    const next = { ...row }
    if (TEXT_ID_STORES.has(store)) {
      if (!next.id) next.id = crypto.randomUUID()
    } else if (!isUuid(next.id)) {
      // Let Postgres mint a UUID — drop invalid local string ids.
      delete next.id
    }
    if (store === 'invoices' && String(next.status || '').trim().toLowerCase() === 'cancelled') {
      next.payment_status = 'Pending'
    }
    // Drop empty-string dates that break Postgres date columns
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        if (
          key === 'date' ||
          key.endsWith('_date') ||
          key.endsWith('_at') ||
          key === 'valid_until' ||
          key === 'rate_valid_until'
        ) {
          next[key] = null
        }
      }
    }
    return next
  })
}

async function upsertTable(
  table: string,
  rows: Row[],
  onConflict: string,
): Promise<number> {
  if (!rows.length) return 0
  const client = getSupabaseClient()
  let written = 0
  for (const batch of chunk(rows, 100)) {
    const { error, count } = await client.from(table).upsert(batch, {
      onConflict,
      ignoreDuplicates: false,
      count: 'exact',
    })
    if (error) throw new Error(`${table}: ${error.message}`)
    written += count ?? batch.length
  }
  return written
}

/**
 * Upload a local / Sheets backup JSON into the connected Supabase project.
 * Requires cloud mode (Settings credentials or env).
 */
export async function importMigrationDumpToSupabase(
  dump: MigrationDump,
): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) {
    throw new Error('Connect Supabase first, then upload the backup')
  }

  const counts: Record<string, number> = {}

  // Settings & users first so the app stays usable if later tables fail mid-import.
  const settings = prepareRows('app_settings', (dump.app_settings as Row[]) || [])
  counts.app_settings = await upsertTable('app_settings', settings, 'key')

  const users = prepareRows('app_users', (dump.app_users as Row[]) || [])
  counts.app_users = await upsertTable('app_users', users, 'email')

  for (const store of LOCAL_STORES) {
    if (store === 'app_settings' || store === 'app_users') continue
    const prepared = prepareRows(store, (dump[store as keyof MigrationDump] as Row[]) || [])
    if (!prepared.length) {
      counts[store] = 0
      continue
    }
    if (TEXT_ID_STORES.has(store)) {
      counts[store] = await upsertTable(store, prepared, 'id')
      continue
    }
    // Rows without id: insert; with id: upsert on id
    const withId = prepared.filter((r) => isUuid(r.id))
    const withoutId = prepared.filter((r) => !isUuid(r.id))
    let n = 0
    if (withId.length) n += await upsertTable(store, withId, 'id')
    if (withoutId.length) {
      const client = getSupabaseClient()
      for (const batch of chunk(withoutId, 100)) {
        const { error, count } = await client.from(store).insert(batch, { count: 'exact' })
        if (error) throw new Error(`${store}: ${error.message}`)
        n += count ?? batch.length
      }
    }
    counts[store] = n
  }

  return counts
}

export async function importCloudDumpFromFile(file: File): Promise<Record<string, number>> {
  const text = await file.text()
  const dump = JSON.parse(text) as MigrationDump
  if (!dump || typeof dump !== 'object') throw new Error('Invalid backup file')
  return importMigrationDumpToSupabase(dump)
}
