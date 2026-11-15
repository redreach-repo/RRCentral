import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'

export type ConstructionSite = {
  id: string
  code: string
  name: string
  location: string
  status: string
  notes: string
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

export async function listConstructionSites(): Promise<ConstructionSite[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('construction_sites')
    .select('id, code, name, location, status, notes')
    .order('code')
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as ConstructionSite[]
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
