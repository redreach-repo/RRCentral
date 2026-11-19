/** RR Threads client uniform sizes: Supabase reads and writes. */
import { db } from '../db'
import { isMissingRelationError } from '../errors'
import { isSupabaseConfigured } from '../supabaseConfig'
import type { UniformIssue, UniformStaff } from './clientUniforms'

export type UniformLoad = { staff: UniformStaff[]; issues: UniformIssue[]; missingTable: boolean }

const STAFF_COLUMNS =
  'id, client_id, full_name, employee_code, department, job_title, shirt_size, trouser_size, jacket_size, shoe_size, cap_size, other_sizes, active, notes, clients(company_name)'

export async function loadClientUniforms(): Promise<UniformLoad> {
  if (!isSupabaseConfigured()) return { staff: [], issues: [], missingTable: false }
  const [staff, issues] = await Promise.all([
    db.from('client_uniform_staff').select(STAFF_COLUMNS).order('full_name').limit(2000),
    db
      .from('client_uniform_issues')
      .select('id, staff_id, item, size, quantity, issued_on, notes')
      .order('issued_on', { ascending: false })
      .limit(5000),
  ])
  if (staff.error || issues.error) {
    const err = staff.error || issues.error
    if (isMissingRelationError(err)) return { staff: [], issues: [], missingTable: true }
    throw err
  }
  return {
    staff: (staff.data || []) as unknown as UniformStaff[],
    issues: ((issues.data || []) as UniformIssue[]).map((i) => ({ ...i, quantity: Number(i.quantity) || 0 })),
    missingTable: false,
  }
}

export type UniformStaffInput = Omit<UniformStaff, 'id' | 'clients'>

function cleanStaff(input: UniformStaffInput): UniformStaffInput {
  const trim = (v: string) => String(v || '').trim()
  return {
    client_id: input.client_id,
    full_name: trim(input.full_name),
    employee_code: trim(input.employee_code),
    department: trim(input.department),
    job_title: trim(input.job_title),
    shirt_size: trim(input.shirt_size),
    trouser_size: trim(input.trouser_size),
    jacket_size: trim(input.jacket_size),
    shoe_size: trim(input.shoe_size),
    cap_size: trim(input.cap_size),
    other_sizes: trim(input.other_sizes),
    active: input.active,
    notes: trim(input.notes),
  }
}

export async function saveUniformStaff(id: string | null, input: UniformStaffInput): Promise<void> {
  const row = cleanStaff(input)
  const { error } = id
    ? await db
        .from('client_uniform_staff')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
    : await db.from('client_uniform_staff').insert(row)
  if (error) throw error
}

export async function addUniformIssue(input: {
  staffId: string
  item: string
  size: string
  quantity: number
  issuedOn: string
  notes: string
}): Promise<void> {
  const { error } = await db.from('client_uniform_issues').insert({
    staff_id: input.staffId,
    item: input.item.trim(),
    size: input.size.trim(),
    quantity: input.quantity,
    issued_on: input.issuedOn,
    notes: input.notes.trim(),
  })
  if (error) throw error
}

export async function deleteUniformIssue(id: string): Promise<void> {
  const { error } = await db.from('client_uniform_issues').delete().eq('id', id)
  if (error) throw error
}
