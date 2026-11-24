/** RR Threads client uniform sizes: Supabase reads and writes. */
import { db } from '../db'
import { isMissingRelationError, isUndefinedColumnError } from '../errors'
import { isSupabaseConfigured } from '../supabaseConfig'
import type { UniformIssue, UniformStaff } from './clientUniforms'

export type UniformLoad = {
  staff: UniformStaff[]
  issues: UniformIssue[]
  missingTable: boolean
  /** False until client-po-uniform-issues.sql has run (issues cannot be tied to a PO yet). */
  poLinked?: boolean
}

const ISSUE_COLUMNS = 'id, staff_id, item, size, quantity, issued_on, notes'

function loadIssues(columns: string) {
  return db.from('client_uniform_issues').select(columns).order('issued_on', { ascending: false }).limit(5000)
}

const STAFF_COLUMNS =
  'id, client_id, full_name, employee_code, department, job_title, shirt_size, trouser_size, jacket_size, shoe_size, cap_size, other_sizes, active, notes, clients(company_name)'

export async function loadClientUniforms(): Promise<UniformLoad> {
  if (!isSupabaseConfigured()) return { staff: [], issues: [], missingTable: false }
  const [staff, linked] = await Promise.all([
    db.from('client_uniform_staff').select(STAFF_COLUMNS).order('full_name').limit(2000),
    loadIssues(`${ISSUE_COLUMNS}, po_id, po_line_id`),
  ])
  let issues = linked
  let poLinked = true
  if (linked.error && isUndefinedColumnError(linked.error)) {
    poLinked = false
    issues = await loadIssues(ISSUE_COLUMNS)
  }
  if (staff.error || issues.error) {
    const err = staff.error || issues.error
    if (isMissingRelationError(err)) return { staff: [], issues: [], missingTable: true }
    throw err
  }
  return {
    staff: (staff.data || []) as unknown as UniformStaff[],
    issues: ((issues.data || []) as unknown as UniformIssue[]).map((i) => ({ ...i, quantity: Number(i.quantity) || 0 })),
    missingTable: false,
    poLinked,
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

/** Uniforms issued against one client PO. ready is false until client-po-uniform-issues.sql has run. */
export async function loadPoUniformIssues(poId: string): Promise<{ rows: UniformIssue[]; ready: boolean }> {
  if (!isSupabaseConfigured() || !poId) return { rows: [], ready: false }
  const { data, error } = await db
    .from('client_uniform_issues')
    .select(`${ISSUE_COLUMNS}, po_id, po_line_id`)
    .eq('po_id', poId)
    .limit(5000)
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return { rows: [], ready: false }
    throw error
  }
  return {
    rows: ((data || []) as unknown as UniformIssue[]).map((i) => ({ ...i, quantity: Number(i.quantity) || 0 })),
    ready: true,
  }
}

/** Log uniforms handed out against a client PO line (one row per person). */
export async function addPoUniformIssues(
  rows: { staff_id: string; item: string; size: string; quantity: number; issued_on: string; po_id: string; po_line_id: string; notes?: string }[],
): Promise<void> {
  const clean = rows
    .filter((r) => r.staff_id && Number(r.quantity) > 0)
    .map((r) => ({ ...r, item: r.item.trim() || 'Uniform', size: r.size.trim(), quantity: Math.round(Number(r.quantity)), notes: (r.notes || '').trim() })) // money-guard: not money (pairs)
  for (let i = 0; i < clean.length; i += 200) {
    const { error } = await db.from('client_uniform_issues').insert(clean.slice(i, i + 200))
    if (error) throw error
  }
}

export async function deleteUniformIssue(id: string): Promise<void> {
  const { error } = await db.from('client_uniform_issues').delete().eq('id', id)
  if (error) throw error
}

const BLANK_PERSON = {
  full_name: '',
  employee_code: '',
  department: '',
  job_title: '',
  shirt_size: '',
  trouser_size: '',
  jacket_size: '',
  shoe_size: '',
  cap_size: '',
  other_sizes: '',
  notes: '',
}

/** Save the New and Update lines of an upload. Returns how many were added and updated. */
export async function importUniformStaff(
  lines: { status: string; clientId?: string; existingId?: string; payload: Record<string, string> }[],
): Promise<{ added: number; updated: number }> {
  const inserts = lines
    .filter((l) => l.status === 'new' && l.clientId)
    // Every row carries every column, so a bulk insert never sends null for a blank cell.
    .map((l) => ({ ...BLANK_PERSON, client_id: l.clientId as string, ...l.payload }))
  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await db.from('client_uniform_staff').insert(inserts.slice(i, i + 200))
    if (error) throw error
  }
  const updates = lines.filter((l) => l.status === 'update' && l.existingId)
  const now = new Date().toISOString()
  for (let i = 0; i < updates.length; i += 10) {
    const results = await Promise.all(
      updates
        .slice(i, i + 10)
        .map((l) => db.from('client_uniform_staff').update({ ...l.payload, updated_at: now }).eq('id', l.existingId as string)),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) throw failed.error
  }
  return { added: inserts.length, updated: updates.length }
}
