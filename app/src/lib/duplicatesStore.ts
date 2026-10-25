import { db } from './db'
import { isMissingRelationError } from './errors'
import { pairIds, pairKey, type DuplicateKind } from './duplicates'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { Account, AccountContact } from './types'

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

export type DuplicateData = { accounts: Account[]; contacts: AccountContact[]; dismissed: Set<string>; countryCode: string }

export async function loadDuplicateData(): Promise<DuplicateData> {
  const [accounts, contacts, dismissals, settings] = await Promise.all([
    rows<Account>(db.from('accounts').select('*')),
    rows<AccountContact>(db.from('account_contacts').select('*')),
    // Not kept in the browser-only demo store.
    isSupabaseConfigured() ? rows<{ kind: DuplicateKind; a_id: string; b_id: string }>(db.from('duplicate_dismissals').select('kind, a_id, b_id')) : [],
    rows<{ key: string; value: string }>(db.from('app_settings').select('key, value').eq('key', 'whatsappCountryCode')),
  ])
  return {
    accounts,
    contacts,
    dismissed: new Set(dismissals.map((d) => pairKey(d.kind, d.a_id, d.b_id))),
    countryCode: settings[0]?.value || '971',
  }
}

/** "Not a duplicate": hides the pair from now on. */
export async function dismissPair(kind: DuplicateKind, a: string, b: string, by: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('This works once RR Central is connected to Supabase.')
  const [a_id, b_id] = pairIds(a, b)
  const { error } = await db.from('duplicate_dismissals').insert({ id: crypto.randomUUID(), kind, a_id, b_id, dismissed_by: by, created_at: new Date().toISOString() })
  if (error && (error as { code?: string }).code !== '23505') throw error
}

export type MergeResult = { moved: Record<string, number>; left: Record<string, number>; removed: string }

/** Merges `dup` into `keep` in the database (managers and admins only). */
export async function mergePair(kind: DuplicateKind, keep: string, dup: string): Promise<MergeResult> {
  if (!isSupabaseConfigured()) throw new Error('Merging works once RR Central is connected to Supabase.')
  const fn = kind === 'account' ? 'rr_merge_accounts' : 'rr_merge_contacts'
  const { data, error } = await getSupabaseClient().rpc(fn, { keep, dup })
  if (error) {
    if (/function .* does not exist|Could not find the function/i.test(String(error.message))) {
      throw new Error('Run the duplicates SQL first.')
    }
    throw new Error(error.message)
  }
  return data as MergeResult
}

/** How much hangs off each account, to pick the one to keep and show what moves. */
export async function accountWeights(ids: string[]): Promise<Record<string, Record<string, number>>> {
  const tables = ['account_contacts', 'account_activities', 'tickets', 'quotations', 'invoices', 'sales_deals', 'ctrm_deals', 'contracts'] as const
  const out: Record<string, Record<string, number>> = {}
  for (const id of ids) out[id] = {}
  await Promise.all(
    tables.map(async (t) => {
      const list = await rows<{ account_id: string }>(db.from(t).select('account_id').in('account_id', ids)).catch(() => [])
      for (const r of list) out[r.account_id][t] = (out[r.account_id][t] ?? 0) + 1
    }),
  )
  return out
}
