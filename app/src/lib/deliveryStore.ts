import { currentAuthMode, db } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { BUILD_STAGES, DEFAULT_PACKAGES, monthKey } from './delivery'
import type {
  BuildStage,
  Contract,
  DeliveryPackage,
  Requirement,
  TimeEntry,
  UsageRecord,
} from './types'

type Author = { appUserId: string | null; email: string }

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

let seedingPackages: Promise<void> | null = null

/** The catalogue, seeded in local mode the first time it is read. */
export async function listPackages(): Promise<DeliveryPackage[]> {
  if (seedingPackages) await seedingPackages
  let list = await rows<DeliveryPackage>(db.from('delivery_packages').select('*').order('sort'))
  if (list.length === 0 && currentAuthMode() === 'local') {
    // Several panels read the catalogue at once; seed it only once.
    seedingPackages ??= seedPackages().finally(() => {
      seedingPackages = null
    })
    await seedingPackages
    list = await rows<DeliveryPackage>(db.from('delivery_packages').select('*').order('sort'))
  }
  return [...list].sort((a, b) => a.sort - b.sort)
}

async function seedPackages(): Promise<void> {
  const existing = await rows<DeliveryPackage>(db.from('delivery_packages').select('id'))
  if (existing.length === 0) {
    const now = new Date().toISOString()
    check(
      await db
        .from('delivery_packages')
        .insert(DEFAULT_PACKAGES.map((p) => ({ ...p, id: crypto.randomUUID(), updated_at: now }))),
    )
  }
}

export async function updatePackage(id: string, patch: Partial<DeliveryPackage>): Promise<void> {
  check(
    await db
      .from('delivery_packages')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id),
  )
}

export async function listContracts(accountId?: string): Promise<Contract[]> {
  let q = db.from('contracts').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  return rows<Contract>(q.order('created_at', { ascending: false }))
}

/** The contract that counts for a client: the newest active one, else the newest. */
export function currentContract(contracts: Contract[]): Contract | null {
  const sorted = [...contracts].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return sorted.find((c) => c.status === 'active') ?? sorted[0] ?? null
}

export type ContractInput = Omit<Contract, 'id' | 'account_id' | 'created_at' | 'updated_at'>

/** Save a contract and return its id. */
export async function saveContract(accountId: string, input: ContractInput, id?: string): Promise<string> {
  const now = new Date().toISOString()
  const newId = id ?? crypto.randomUUID()
  const write = (row: Partial<ContractInput>) =>
    id
      ? db.from('contracts').update({ ...row, updated_at: now }).eq('id', id)
      : db.from('contracts').insert({ ...row, id: newId, account_id: accountId, created_at: now, updated_at: now })
  const result = await write(input)
  if (result.error && isUndefinedColumnError(result.error)) {
    // Before the contract billing migration runs, save without its two columns.
    const { auto_invoice: _auto, billing_from: _from, ...rest } = input
    check(await write(rest))
    return newId
  }
  check(result)
  return newId
}

export async function listStages(accountId: string): Promise<BuildStage[]> {
  return rows<BuildStage>(db.from('build_stages').select('*').eq('account_id', accountId))
}

/** Create the six build stages for a client if they are not there yet. */
export async function ensureStages(accountId: string, existing: BuildStage[]): Promise<void> {
  const missing = BUILD_STAGES.filter((s) => !existing.some((e) => e.stage === s.value))
  if (!missing.length) return
  const now = new Date().toISOString()
  check(
    await db.from('build_stages').insert(
      missing.map((s) => ({
        id: crypto.randomUUID(),
        account_id: accountId,
        stage: s.value,
        status: 'not_started',
        owner_user_id: null,
        due_date: null,
        blocker_note: '',
        completed_at: null,
        created_at: now,
      })),
    ),
  )
}

export async function updateStage(
  id: string,
  patch: Partial<Pick<BuildStage, 'status' | 'owner_user_id' | 'due_date' | 'blocker_note'>>,
): Promise<void> {
  const next: Record<string, unknown> = { ...patch }
  if (patch.status) next.completed_at = patch.status === 'done' ? new Date().toISOString() : null
  check(await db.from('build_stages').update(next).eq('id', id))
}

export async function listRequirements(accountId: string): Promise<Requirement[]> {
  return rows<Requirement>(
    db.from('requirements').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
  )
}

export async function saveRequirement(
  accountId: string,
  input: Pick<Requirement, 'title' | 'detail' | 'status' | 'source' | 'is_change_request'>,
  createdBy: string,
  id?: string,
): Promise<void> {
  if (id) {
    check(await db.from('requirements').update(input).eq('id', id))
    return
  }
  check(
    await db.from('requirements').insert({
      ...input,
      id: crypto.randomUUID(),
      account_id: accountId,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    }),
  )
}

export async function deleteRequirement(id: string): Promise<void> {
  check(await db.from('requirements').delete().eq('id', id))
}

export async function listTimeEntries(accountId?: string, sinceDate?: string): Promise<TimeEntry[]> {
  let q = db.from('time_entries').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  if (sinceDate) q = q.gte('date', sinceDate)
  return rows<TimeEntry>(q.order('date', { ascending: false }))
}

export async function listTicketTime(ticketId: string): Promise<TimeEntry[]> {
  const { data, error } = await db.from('time_entries').select('*').eq('ticket_id', ticketId)
  // Before the ticket time migration runs the column is missing: show nothing.
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return []
    throw error
  }
  return (data || []) as TimeEntry[]
}

export async function addTimeEntry(
  accountId: string,
  input: Pick<TimeEntry, 'date' | 'hours' | 'category' | 'note'> & { ticket_id?: string | null },
  author: Author,
): Promise<void> {
  const row = {
    ...input,
    id: crypto.randomUUID(),
    account_id: accountId,
    user_id: author.appUserId,
    user_email: author.email,
    created_at: new Date().toISOString(),
  }
  const result = await db.from('time_entries').insert(row)
  if (result.error && row.ticket_id && isUndefinedColumnError(result.error)) {
    // The ticket link column is not there yet: still log the hours.
    const { ticket_id: _ticket, ...rest } = row
    check(await db.from('time_entries').insert(rest))
    return
  }
  check(result)
}

export async function deleteTimeEntry(id: string): Promise<void> {
  check(await db.from('time_entries').delete().eq('id', id))
}

export async function listUsage(accountId?: string): Promise<UsageRecord[]> {
  let q = db.from('usage_records').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  return rows<UsageRecord>(q.order('month', { ascending: false }))
}

/** One row per client per month: update it if it exists, else add it. */
export async function saveUsage(
  accountId: string,
  month: string,
  input: Pick<
    UsageRecord,
    'whatsapp_marketing_count' | 'whatsapp_service_count' | 'ai_cost_usd' | 'lead_credits_cost_usd'
  >,
  existing: UsageRecord | undefined,
): Promise<void> {
  const key = monthKey(month)
  const now = new Date().toISOString()
  if (existing) {
    check(await db.from('usage_records').update({ ...input, updated_at: now }).eq('id', existing.id))
    return
  }
  check(
    await db.from('usage_records').insert({
      ...input,
      id: crypto.randomUUID(),
      account_id: accountId,
      month: key,
      updated_at: now,
    }),
  )
}
