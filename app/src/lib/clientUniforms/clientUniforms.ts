/**
 * RR Threads (01): uniform sizes for our clients' staff, and the issue log.
 * Pure helpers only; data access lives in clientUniformsStore.ts.
 */
import type { UserRole } from '../types'

export type UniformSizeField = 'shirt_size' | 'trouser_size' | 'jacket_size' | 'shoe_size' | 'cap_size'

export type UniformStaff = {
  id: string
  client_id: string
  full_name: string
  employee_code: string
  department: string
  job_title: string
  shirt_size: string
  trouser_size: string
  jacket_size: string
  shoe_size: string
  cap_size: string
  other_sizes: string
  active: boolean
  notes: string
  clients?: { company_name?: string | null } | null
}

export type UniformIssue = {
  id: string
  staff_id: string
  item: string
  size: string
  quantity: number
  issued_on: string
  notes: string
}

/** The sizes we keep for everyone, in the order they show on screen. */
export const UNIFORM_SIZE_FIELDS: { field: UniformSizeField; label: string; item: string }[] = [
  { field: 'shirt_size', label: 'Shirt', item: 'Shirt' },
  { field: 'trouser_size', label: 'Trousers', item: 'Trousers' },
  { field: 'jacket_size', label: 'Jacket', item: 'Jacket' },
  { field: 'shoe_size', label: 'Shoes', item: 'Shoes' },
  { field: 'cap_size', label: 'Cap', item: 'Cap' },
]

/** Items offered when logging an issue. Anything else can be typed in. */
export const UNIFORM_ITEMS = ['Shirt', 'T-shirt', 'Polo', 'Trousers', 'Jacket', 'Coverall', 'Shoes', 'Cap', 'Apron', 'Vest']

/** "Shirt L · Trousers 32 · Shoes 42", skipping blanks. */
export function uniformSizeSummary(s: Partial<Record<UniformSizeField, string | null>> & { other_sizes?: string | null }): string {
  const parts = UNIFORM_SIZE_FIELDS.map(({ field, label }) => {
    const v = String(s[field] ?? '').trim()
    return v ? `${label} ${v}` : ''
  }).filter(Boolean)
  const other = String(s.other_sizes ?? '').trim()
  if (other) parts.push(other)
  return parts.join(' · ')
}

/** Size on file for an item, so the issue form can prefill it. */
export function sizeForItem(s: Partial<Record<UniformSizeField, string | null>>, item: string): string {
  const key = item.trim().toLowerCase()
  const map: Record<string, UniformSizeField> = {
    shirt: 'shirt_size',
    't-shirt': 'shirt_size',
    polo: 'shirt_size',
    coverall: 'shirt_size',
    trousers: 'trouser_size',
    pants: 'trouser_size',
    jacket: 'jacket_size',
    vest: 'jacket_size',
    shoes: 'shoe_size',
    boots: 'shoe_size',
    cap: 'cap_size',
  }
  const field = map[key]
  return field ? String(s[field] ?? '').trim() : ''
}

export function uniformClientName(row: Pick<UniformStaff, 'clients' | 'client_id'>): string {
  return row.clients?.company_name?.trim() || 'Unknown client'
}

/** Filter the roster by client, active state and free text (name, employee no, department, job, client). */
export function filterUniformStaff<T extends UniformStaff>(
  rows: T[],
  opts: { clientId?: string; search?: string; includeInactive?: boolean },
): T[] {
  const q = String(opts.search || '').trim().toLowerCase()
  return rows.filter((r) => {
    if (opts.clientId && r.client_id !== opts.clientId) return false
    if (!opts.includeInactive && !r.active) return false
    if (!q) return true
    return [r.full_name, r.employee_code, r.department, r.job_title, uniformClientName(r)]
      .some((v) => String(v || '').toLowerCase().includes(q))
  })
}

/** Newest issue per person (by issued date, then by created order in the list). */
export function latestIssueByStaff(issues: UniformIssue[]): Map<string, UniformIssue> {
  const out = new Map<string, UniformIssue>()
  for (const i of issues) {
    const cur = out.get(i.staff_id)
    if (!cur || i.issued_on > cur.issued_on) out.set(i.staff_id, i)
  }
  return out
}

/** One person's history, newest first. */
export function issuesForStaff(issues: UniformIssue[], staffId: string): UniformIssue[] {
  return issues
    .filter((i) => i.staff_id === staffId)
    .sort((a, b) => (a.issued_on < b.issued_on ? 1 : a.issued_on > b.issued_on ? -1 : 0))
}

/** Problem with the person form, or null when it can be saved. */
export function uniformStaffProblem(input: { clientId: string; fullName: string }): string | null {
  if (!input.clientId) return 'Pick a client'
  if (!input.fullName.trim()) return 'Enter the person’s name'
  return null
}

/** Problem with the issue form, or null when it can be saved. */
export function uniformIssueProblem(input: { item: string; quantity: number; issuedOn: string }): string | null {
  if (!input.item.trim()) return 'Enter the item'
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return 'Quantity must be 1 or more'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn)) return 'Pick the date it was issued'
  return null
}

/** Same rule as the database: admin, manager and sales can add and edit; viewer reads; staff role has no access. */
export function canEditUniforms(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'sales'
}

export function canDeleteUniformIssue(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'manager'
}

/** Rows for the CSV download: one line per person with their sizes and last issue. */
export function uniformCsvRows(rows: UniformStaff[], latest: Map<string, UniformIssue>): Record<string, unknown>[] {
  return rows.map((r) => {
    const last = latest.get(r.id)
    return {
      client: uniformClientName(r),
      name: r.full_name,
      employee_no: r.employee_code,
      department: r.department,
      job_title: r.job_title,
      shirt: r.shirt_size,
      trousers: r.trouser_size,
      jacket: r.jacket_size,
      shoes: r.shoe_size,
      cap: r.cap_size,
      other_sizes: r.other_sizes,
      last_issued_on: last?.issued_on || '',
      last_issued_item: last ? `${last.quantity} x ${last.item}${last.size ? ` (${last.size})` : ''}` : '',
      active: r.active ? 'yes' : 'no',
    }
  })
}

export const UNIFORM_CSV_HEADERS = [
  'client',
  'name',
  'employee_no',
  'department',
  'job_title',
  'shirt',
  'trousers',
  'jacket',
  'shoes',
  'cap',
  'other_sizes',
  'last_issued_on',
  'last_issued_item',
  'active',
]
