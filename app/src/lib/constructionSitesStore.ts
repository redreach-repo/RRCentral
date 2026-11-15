import { db } from './db'
import { isMissingRelationError } from './errors'
import { withoutSoftDeleted } from './softDelete'
import { isSupabaseConfigured } from './supabaseConfig'

export type ConstructionSite = {
  id: string
  code: string
  name: string
  location: string
  status: string
  notes: string
  deleted_at?: string | null
}

export type SiteWorkforceAssignment = {
  id: string
  site_id: string
  employee_id: string | null
  role_label: string
  starts_on: string | null
  ends_on: string | null
  notes: string
  hr_employees?: { full_name: string } | null
}

const SITE_SELECT = 'id, code, name, location, status, notes, deleted_at'
const SITE_SELECT_LEGACY = 'id, code, name, location, status, notes'

export async function listConstructionSites(opts?: {
  includeDeleted?: boolean
}): Promise<ConstructionSite[]> {
  if (!isSupabaseConfigured()) return []
  let q = db.from('construction_sites').select(SITE_SELECT)
  if (!opts?.includeDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q.order('code')
  if (error) {
    if (isMissingRelationError(error)) return []
    // Fallback when deleted_at column is not yet migrated.
    if (String(error.message || '').toLowerCase().includes('deleted_at')) {
      const res = await db.from('construction_sites').select(SITE_SELECT_LEGACY).order('code')
      if (res.error) {
        if (isMissingRelationError(res.error)) return []
        throw res.error
      }
      return (res.data || []) as ConstructionSite[]
    }
    throw error
  }
  const rows = (data || []) as ConstructionSite[]
  return opts?.includeDeleted ? rows : withoutSoftDeleted(rows)
}

export async function softDeleteConstructionSite(id: string): Promise<void> {
  const { error } = await db
    .from('construction_sites')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreConstructionSite(id: string): Promise<void> {
  const { error } = await db
    .from('construction_sites')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function createConstructionSite(input: {
  code: string
  name: string
  location?: string
  status?: string
}): Promise<void> {
  const { error } = await db.from('construction_sites').insert({
    code: input.code.trim().toUpperCase() || `S${Date.now().toString().slice(-4)}`,
    name: input.name.trim(),
    location: (input.location || '').trim(),
    status: input.status || 'active',
  })
  if (error) throw error
}

export async function listSiteAssignments(siteId: string): Promise<SiteWorkforceAssignment[]> {
  const { data, error } = await db
    .from('site_workforce_assignments')
    .select('id, site_id, employee_id, role_label, starts_on, ends_on, notes, hr_employees(full_name)')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as SiteWorkforceAssignment[]
}

export async function assignSiteWorkforce(input: {
  siteId: string
  employeeId: string | null
  roleLabel: string
  startsOn?: string | null
  endsOn?: string | null
}): Promise<void> {
  const { error } = await db.from('site_workforce_assignments').insert({
    site_id: input.siteId,
    employee_id: input.employeeId || null,
    role_label: input.roleLabel.trim(),
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
  })
  if (error) throw error
}
