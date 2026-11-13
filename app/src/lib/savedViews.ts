import { db } from './db'

export type SavedView = {
  id: string
  module_id: string
  name: string
  filters: Record<string, unknown>
  columns: unknown
  sort: unknown
  is_shared: boolean
  is_default: boolean
  owner_user_id: string | null
}

export type SavedViewInput = {
  module_id: string
  name: string
  filters: Record<string, unknown>
  is_shared?: boolean
  is_default?: boolean
  owner_user_id?: string | null
}

export type AccountsViewFilters = {
  q?: string
  type?: string
  owner?: string
}

export function normalizeAccountsFilters(input: {
  q: string
  type: string
  owner: string
}): AccountsViewFilters {
  const out: AccountsViewFilters = {}
  const q = input.q.trim()
  if (q) out.q = q
  if (input.type && input.type !== 'all') out.type = input.type
  if (input.owner && input.owner !== 'all') out.owner = input.owner
  return out
}

export function accountsFiltersEqual(a: AccountsViewFilters, b: AccountsViewFilters): boolean {
  return (
    (a.q || '') === (b.q || '') &&
    (a.type || 'all') === (b.type || 'all') &&
    (a.owner || 'all') === (b.owner || 'all')
  )
}

export async function listSavedViews(moduleId: string): Promise<SavedView[]> {
  const { data, error } = await db
    .from('saved_views')
    .select(
      'id, module_id, name, filters, columns, sort, is_shared, is_default, owner_user_id',
    )
    .eq('module_id', moduleId)
    .order('is_default', { ascending: false })
    .order('name')
  if (error || !data) return []
  return data as SavedView[]
}

export async function createSavedView(input: SavedViewInput): Promise<SavedView> {
  const row = {
    module_id: input.module_id,
    name: input.name.trim(),
    filters: input.filters || {},
    columns: [],
    sort: [],
    is_shared: Boolean(input.is_shared),
    is_default: Boolean(input.is_default),
    owner_user_id: input.owner_user_id ?? null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await db
    .from('saved_views')
    .insert(row)
    .select(
      'id, module_id, name, filters, columns, sort, is_shared, is_default, owner_user_id',
    )
    .single()
  if (error) throw error
  return data as SavedView
}

export async function deleteSavedView(id: string): Promise<void> {
  const { error } = await db.from('saved_views').delete().eq('id', id)
  if (error) throw error
}

export async function setDefaultSavedView(moduleId: string, id: string): Promise<void> {
  // Clear previous defaults for this module (best-effort; RLS limits to own/admin).
  await db
    .from('saved_views')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('module_id', moduleId)
    .eq('is_default', true)
  const { error } = await db
    .from('saved_views')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
