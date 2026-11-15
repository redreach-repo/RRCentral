import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import type { Warehouse } from './warehouses'

export async function listWarehouses(): Promise<Warehouse[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('warehouses')
    .select('id, code, name, is_default, active')
    .order('code')
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as Warehouse[]
}

export async function createWarehouse(input: { code: string; name: string; isDefault?: boolean }): Promise<void> {
  const { error } = await db.from('warehouses').insert({
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    is_default: Boolean(input.isDefault),
    active: true,
  })
  if (error) throw error
}
