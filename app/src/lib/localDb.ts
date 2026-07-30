/**
 * IndexedDB-backed query client that mirrors the Supabase `.from().select()…` API.
 * Used when VITE_SUPABASE_URL is missing or a placeholder (e.g. GitHub Pages demos).
 */

export const DB_NAME = 'rrcentral_local'
const DB_VERSION = 1

export const LOCAL_STORES = [
  'app_settings',
  'app_users',
  'clients',
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
  'activity_log',
] as const

export type LocalStoreName = (typeof LOCAL_STORES)[number]

const DEFAULT_SETTINGS: { key: string; value: string }[] = [
  { key: 'companyName', value: 'Red Reach Middle East FZE' },
  { key: 'brand', value: 'RED REACH' },
  { key: 'tagline', value: 'Multi-division commerce · UAE' },
  { key: 'address', value: 'P.O. Box 6641, Dubai, UAE' },
  { key: 'email', value: 'info@redreach.ae' },
  { key: 'phone', value: '' },
  { key: 'website', value: 'www.redreach.ae' },
  { key: 'trn', value: '' },
  { key: 'accountName', value: 'Red Reach Middle East FZE' },
  { key: 'bankName', value: 'Mashreq Bank' },
  { key: 'bankAccount', value: '019100599735' },
  { key: 'iban', value: 'AE230330000019100599735' },
  { key: 'swift', value: '' },
  { key: 'paymentTerms', value: 'Immediate upon delivery' },
  { key: 'paymentMethod', value: 'Cheque or Bank Transfer' },
  { key: 'quoteClosing', value: 'Thanking you and looking forward to do business with you.' },
  {
    key: 'quoteTerms',
    value: 'Prices valid for quantities mentioned. Subject to availability at time of order.',
  },
  { key: 'deliveryTerms', value: '2 weeks once the advance payment is received' },
  {
    key: 'moqTerms',
    value:
      'Unit prices are based on MOQ of 50 pcs per style per colour. Prices may vary for lower quantities.',
  },
  { key: 'vatRate', value: '0.05' },
  { key: 'currency', value: 'AED' },
  { key: 'quotePrefix', value: 'RR' },
  { key: 'invoicePrefix', value: 'RR' },
  { key: 'quoteValidityDays', value: '14' },
  { key: 'moqDefault', value: '50' },
  { key: 'logoUrl', value: '' },
  { key: 'portalBaseUrl', value: '' },
  { key: 'bilingualDefault', value: 'en' },
  { key: 'whatsappCountryCode', value: '971' },
  { key: 'followUpDaysAfterQuote', value: '3' },
  { key: 'calendarSync', value: 'yes' },
  { key: 'calendarId', value: 'primary' },
  { key: 'zohoClientId', value: '' },
  { key: 'zohoClientSecret', value: '' },
  { key: 'zohoRefreshToken', value: '' },
  { key: 'zohoAccountsDomain', value: 'https://accounts.zoho.com' },
  { key: 'zohoCalendarDomain', value: 'https://calendar.zoho.com' },
  { key: 'zohoMailDomain', value: 'https://mail.zoho.com' },
  { key: 'zohoCalendarUid', value: '' },
  { key: 'zohoMailAccountId', value: '' },
  { key: 'zohoCalendarEnabled', value: 'no' },
  { key: 'zohoMailEnabled', value: 'no' },
]

const DEFAULT_ADMINS: {
  email: string
  name: string
  role: 'admin'
  active: boolean
  created_at: string
}[] = [
  {
    email: 'alfredsv@gmail.com',
    name: 'Alfred',
    role: 'admin',
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    email: 'redreachdxb@gmail.com',
    name: 'Red Reach DXB',
    role: 'admin',
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    email: 'alfred@redreach.ae',
    name: 'Alfred',
    role: 'admin',
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    email: 'jacob@redreach.ae',
    name: 'Jacob',
    role: 'admin',
    active: true,
    created_at: new Date().toISOString(),
  },
]

type Row = Record<string, unknown>

type Filter =
  | { type: 'eq'; col: string; val: unknown }
  | { type: 'ilike'; col: string; pattern: string }
  | { type: 'gte'; col: string; val: unknown }
  | { type: 'lte'; col: string; val: unknown }
  | { type: 'is'; col: string; val: unknown }
  | { type: 'in'; col: string; vals: unknown[] }
  | { type: 'not'; col: string; op: string; val: unknown }

interface OrderSpec {
  col: string
  ascending: boolean
}

interface QueryResult<T = Row> {
  data: T | T[] | null
  error: { message: string } | null
}

let dbPromise: Promise<IDBDatabase> | null = null
let seeded = false

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const database = req.result
      for (const name of LOCAL_STORES) {
        if (database.objectStoreNames.contains(name)) continue
        if (name === 'app_settings') {
          database.createObjectStore(name, { keyPath: 'key' })
        } else {
          database.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'))
  })

  return dbPromise
}

function txStore(
  database: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return database.transaction(store, mode).objectStore(store)
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

async function getAll(store: string): Promise<Row[]> {
  const database = await openDb()
  return (await reqToPromise(txStore(database, store, 'readonly').getAll())) as Row[]
}

async function putRow(store: string, row: Row): Promise<void> {
  const database = await openDb()
  const tx = database.transaction(store, 'readwrite')
  tx.objectStore(store).put(row)
  await txDone(tx)
}

async function deleteKey(store: string, key: IDBValidKey): Promise<void> {
  const database = await openDb()
  const tx = database.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await txDone(tx)
}

async function ensureSeeded(): Promise<void> {
  if (seeded) return
  const database = await openDb()

  const settingsCount = await reqToPromise(txStore(database, 'app_settings', 'readonly').count())
  if (settingsCount === 0) {
    const tx = database.transaction('app_settings', 'readwrite')
    const store = tx.objectStore('app_settings')
    for (const row of DEFAULT_SETTINGS) {
      store.put(row)
    }
    await txDone(tx)
  }

  const usersCount = await reqToPromise(txStore(database, 'app_users', 'readonly').count())
  if (usersCount === 0) {
    const tx = database.transaction('app_users', 'readwrite')
    const store = tx.objectStore('app_users')
    for (const admin of DEFAULT_ADMINS) {
      store.put({ id: crypto.randomUUID(), ...admin })
    }
    await txDone(tx)
  }

  seeded = true
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function matchIlike(value: unknown, pattern: string): boolean {
  const text = String(value ?? '').toLowerCase()
  const escaped = pattern
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.')
  return new RegExp(`^${escaped}$`).test(text)
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((row) =>
    filters.every((f) => {
      const val = row[f.col]
      switch (f.type) {
        case 'eq':
          return val === f.val
        case 'ilike':
          return matchIlike(val, f.pattern)
        case 'gte':
          return compareValues(val, f.val) >= 0
        case 'lte':
          return compareValues(val, f.val) <= 0
        case 'is':
          if (f.val === null) return val === null || val === undefined
          return val === f.val
        case 'in':
          return f.vals.includes(val)
        case 'not':
          if (f.op === 'is') {
            if (f.val === null) return !(val === null || val === undefined)
            return val !== f.val
          }
          if (f.op === 'eq') return val !== f.val
          return true
        default:
          return true
      }
    }),
  )
}

function projectColumns(rows: Row[], columns: string | null): Row[] {
  if (!columns || columns === '*') return rows
  const cols = columns.split(',').map((c) => c.trim()).filter(Boolean)
  return rows.map((row) => {
    const out: Row = {}
    for (const col of cols) {
      out[col] = row[col]
    }
    return out
  })
}

function withDefaults(table: string, row: Row): Row {
  const now = new Date().toISOString()
  const next: Row = { ...row }

  if (table === 'app_settings') {
    if (next.value == null) next.value = ''
    return next
  }

  if (next.id == null || next.id === '') {
    next.id = crypto.randomUUID()
  }

  if (next.created_at == null && table !== 'income') {
    // income has no created_at in schema; others usually do
    if (
      [
        'app_users',
        'clients',
        'crm',
        'follow_up_updates',
        'quotations',
        'invoices',
        'line_items',
        'quote_templates',
        'expenses',
        'payment_log',
        'activity_log',
      ].includes(table)
    ) {
      next.created_at = now
    }
  }

  if (
    next.updated_at == null &&
    (table === 'crm' || table === 'quotations' || table === 'invoices' || table === 'products')
  ) {
    next.updated_at = now
  }

  if (table === 'attachments' && next.uploaded_at == null) {
    next.uploaded_at = now
  }

  return next
}

function rowKey(table: string, row: Row): IDBValidKey {
  if (table === 'app_settings') return String(row.key)
  return String(row.id)
}

class QueryBuilder implements PromiseLike<QueryResult> {
  private table: string
  private filters: Filter[] = []
  private orderSpec: OrderSpec | null = null
  private limitCount: number | null = null
  private columns: string | null = null
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload: Row | Row[] | null = null
  private upsertOpts: { onConflict?: string } | null = null
  private updatePatch: Row | null = null
  private singleMode: 'none' | 'maybe' | 'single' = 'none'

  constructor(table: string) {
    this.table = table
  }

  select(columns = '*') {
    this.mode = 'select'
    this.columns = columns
    return this
  }

  insert(rowOrRows: Row | Row[]) {
    this.mode = 'insert'
    this.payload = rowOrRows
    return this
  }

  update(patch: Row) {
    this.mode = 'update'
    this.updatePatch = patch
    return this
  }

  delete() {
    this.mode = 'delete'
    return this
  }

  upsert(row: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = 'upsert'
    this.payload = row
    this.upsertOpts = opts ?? null
    return this
  }

  eq(col: string, val: unknown) {
    this.filters.push({ type: 'eq', col, val })
    return this
  }

  ilike(col: string, pattern: string) {
    this.filters.push({ type: 'ilike', col, pattern })
    return this
  }

  gte(col: string, val: unknown) {
    this.filters.push({ type: 'gte', col, val })
    return this
  }

  lte(col: string, val: unknown) {
    this.filters.push({ type: 'lte', col, val })
    return this
  }

  is(col: string, val: unknown) {
    this.filters.push({ type: 'is', col, val })
    return this
  }

  in(col: string, vals: unknown[]) {
    this.filters.push({ type: 'in', col, vals })
    return this
  }

  not(col: string, op: string, val: unknown) {
    this.filters.push({ type: 'not', col, op, val })
    return this
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, ascending: opts?.ascending !== false }
    return this
  }

  limit(n: number) {
    this.limitCount = n
    return this
  }

  maybeSingle() {
    this.singleMode = 'maybe'
    return this
  }

  single() {
    this.singleMode = 'single'
    return this
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<QueryResult> {
    try {
      await ensureSeeded()

      if (this.mode === 'insert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) =>
          withDefaults(this.table, r),
        )
        for (const row of rows) {
          await putRow(this.table, row)
        }
        return { data: Array.isArray(this.payload) ? rows : rows[0], error: null }
      }

      if (this.mode === 'upsert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) =>
          withDefaults(this.table, r),
        )
        const conflict = this.upsertOpts?.onConflict
        const existing = await getAll(this.table)

        for (const row of rows) {
          if (conflict && conflict !== 'id' && conflict !== 'key') {
            const match = existing.find((e) => e[conflict] === row[conflict])
            if (match) {
              const merged = { ...match, ...row }
              if (this.table !== 'app_settings') {
                merged.id = match.id
              }
              await putRow(this.table, merged)
              continue
            }
          }
          await putRow(this.table, row)
        }
        return { data: Array.isArray(this.payload) ? rows : rows[0], error: null }
      }

      if (this.mode === 'update') {
        const all = await getAll(this.table)
        const matched = applyFilters(all, this.filters)
        const updated: Row[] = []
        for (const row of matched) {
          const next = { ...row, ...this.updatePatch }
          await putRow(this.table, next)
          updated.push(next)
        }
        return { data: updated, error: null }
      }

      if (this.mode === 'delete') {
        const all = await getAll(this.table)
        const matched = applyFilters(all, this.filters)
        for (const row of matched) {
          await deleteKey(this.table, rowKey(this.table, row))
        }
        return { data: matched, error: null }
      }

      // select
      let rows = applyFilters(await getAll(this.table), this.filters)

      if (this.orderSpec) {
        const { col, ascending } = this.orderSpec
        rows = [...rows].sort((a, b) => {
          const cmp = compareValues(a[col], b[col])
          return ascending ? cmp : -cmp
        })
      }

      if (this.limitCount != null) {
        rows = rows.slice(0, this.limitCount)
      }

      rows = projectColumns(rows, this.columns)

      if (this.singleMode === 'maybe') {
        if (rows.length === 0) return { data: null, error: null }
        return { data: rows[0], error: null }
      }

      if (this.singleMode === 'single') {
        if (rows.length === 0) {
          return { data: null, error: { message: 'No rows found' } }
        }
        if (rows.length > 1) {
          return { data: null, error: { message: 'Multiple rows found' } }
        }
        return { data: rows[0], error: null }
      }

      return { data: rows, error: null }
    } catch (e) {
      return {
        data: null,
        error: { message: e instanceof Error ? e.message : 'Local DB error' },
      }
    }
  }
}

export const localDb = {
  from(table: string) {
    return new QueryBuilder(table)
  },
}

export type MigrationDump = {
  version?: number
  cleanVersion?: number
  exportedAt?: string
  counts?: Record<string, number>
  app_settings?: Row[]
  app_users?: Row[]
  clients?: Row[]
  crm?: Row[]
  follow_up_updates?: Row[]
  quotations?: Row[]
  invoices?: Row[]
  line_items?: Row[]
  products?: Row[]
  quote_templates?: Row[]
  income?: Row[]
  expenses?: Row[]
  payment_log?: Row[]
  attachments?: Row[]
  activity_log?: Row[]
}

async function clearStore(store: string): Promise<void> {
  const database = await openDb()
  const tx = database.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  await txDone(tx)
}

async function putMany(store: string, rows: Row[]): Promise<void> {
  if (!rows.length) return
  const database = await openDb()
  const tx = database.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const row of rows) {
    const next = { ...row }
    if (store !== 'app_settings' && !next.id) {
      next.id = crypto.randomUUID()
    }
    if (store === 'quote_templates' && next.items_json != null && typeof next.items_json === 'string') {
      try {
        next.items_json = JSON.parse(next.items_json as string)
      } catch {
        next.items_json = []
      }
    }
    os.put(next)
  }
  await txDone(tx)
}

/** Export every IndexedDB store as a portable JSON dump (backup / restore). */
export async function exportLocalDump(): Promise<MigrationDump> {
  await openDb()
  const counts: Record<string, number> = {}
  const dump: MigrationDump = {
    version: 1,
    exportedAt: new Date().toISOString(),
    counts,
  }
  for (const store of LOCAL_STORES) {
    const rows = await getAll(store)
    dump[store] = rows
    counts[store] = rows.length
  }
  return dump
}

/** Wipe all local stores and re-seed defaults (settings + admin users). */
export async function clearLocalData(): Promise<void> {
  await openDb()
  for (const store of LOCAL_STORES) {
    await clearStore(store)
  }
  seeded = false
  await ensureSeeded()
}

/**
 * Replace local IndexedDB contents with a Sheets migration dump.
 */
export async function importMigrationDump(dump: MigrationDump): Promise<Record<string, number>> {
  await openDb()
  const counts: Record<string, number> = {}

  for (const store of LOCAL_STORES) {
    let rows = (dump[store as keyof MigrationDump] as Row[] | undefined) || []
    // Dedupe users by email so login chips stay clean
    if (store === 'app_users') {
      const byEmail = new Map<string, Row>()
      for (const row of rows) {
        const email = String(row.email || '')
          .trim()
          .toLowerCase()
        if (!email) continue
        byEmail.set(email, { ...row, email, id: row.id || `user-${email}` })
      }
      rows = [...byEmail.values()]
    }
    await clearStore(store)
    await putMany(store, rows)
    counts[store] = rows.length
  }

  // Keep defaults if dump had no settings/users
  if (!counts.app_settings) {
    await putMany('app_settings', DEFAULT_SETTINGS)
    counts.app_settings = DEFAULT_SETTINGS.length
  }
  if (!counts.app_users) {
    await putMany(
      'app_users',
      DEFAULT_ADMINS.map((u) => ({ ...u, id: `user-${u.email}` })),
    )
    counts.app_users = DEFAULT_ADMINS.length
  }

  seeded = true
  return counts
}

/** Ensure DB is open and seeded (useful before auth/user listing). */
export async function initLocalDb(): Promise<void> {
  await ensureSeeded()
}

export { DEFAULT_ADMINS }
