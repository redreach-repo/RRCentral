/** Reads and writes supplier advances (supabase/migrations/20261331090000_supplier_advances.sql). */
import { db, isSupabaseConfigured } from './db'
import { isMissingRelationError } from './errors'
import type { SupplierAdvance, SupplierAdvanceApplication } from './supplierAdvances'

export type AdvancesLoad = {
  advances: SupplierAdvance[]
  applications: SupplierAdvanceApplication[]
  /** false until the supplier advances SQL is run on the database. */
  ready: boolean
}

const EMPTY: AdvancesLoad = { advances: [], applications: [], ready: false }

/** Every advance and application the signed-in user can see. Missing tables = not set up yet. */
export async function loadSupplierAdvances(): Promise<AdvancesLoad> {
  if (!isSupabaseConfigured()) return EMPTY
  const [a, x] = await Promise.all([
    db.from('supplier_advances').select('*').order('paid_on', { ascending: false }),
    db.from('supplier_advance_applications').select('*'),
  ])
  if (a.error || x.error) {
    const err = a.error || x.error
    if (isMissingRelationError(err)) return EMPTY
    throw err
  }
  return {
    advances: ((a.data || []) as SupplierAdvance[]).map((r) => ({ ...r, amount: Number(r.amount) || 0 })),
    applications: ((x.data || []) as SupplierAdvanceApplication[]).map((r) => ({ ...r, amount: Number(r.amount) || 0 })),
    ready: true,
  }
}

/** Same as loadSupplierAdvances but never throws: totals pages carry on without advances. */
export async function loadSupplierAdvancesQuiet(): Promise<AdvancesLoad> {
  try {
    return await loadSupplierAdvances()
  } catch {
    return EMPTY
  }
}

type AdvanceRow = Omit<SupplierAdvance, 'id' | 'created_by' | 'created_at' | 'quote_reference' | 'currency'>

export async function saveSupplierAdvance(id: string | null, row: AdvanceRow): Promise<SupplierAdvance> {
  const q = id
    ? db.from('supplier_advances').update(row).eq('id', id).select('*').single()
    : db.from('supplier_advances').insert(row).select('*').single()
  const { data, error } = await q
  if (error) throw error
  return data as SupplierAdvance
}

export async function deleteSupplierAdvance(id: string): Promise<void> {
  const { error, count } = await db.from('supplier_advances').delete({ count: 'exact' }).eq('id', id)
  if (error) throw error
  if (count === 0) throw new Error('Only a manager or admin can remove an advance.')
}

export async function applyAdvanceToBill(advanceId: string, expenseId: string, amount: number, appliedOn: string): Promise<void> {
  const { error } = await db
    .from('supplier_advance_applications')
    .insert({ advance_id: advanceId, expense_id: expenseId, amount, applied_on: appliedOn })
  if (error) throw error
}

export async function unapplyAdvance(applicationId: string): Promise<void> {
  const { error, count } = await db
    .from('supplier_advance_applications')
    .delete({ count: 'exact' })
    .eq('id', applicationId)
  if (error) throw error
  if (count === 0) throw new Error('Only a manager or admin can take an advance off a bill.')
}
