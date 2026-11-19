/**
 * Upload client staff uniform sizes from Excel / CSV.
 *
 * 1. findHeaderRow + guessMapping: find the header row and match columns to fields.
 * 2. planUniformImport: turn rows into New / Update / Unchanged / Problem lines
 *    against what is already saved, so the preview shows exactly what will happen.
 *
 * Re-uploading the same file is safe: a person is matched on client + employee no
 * (or client + name when there is no employee no) and updated, never duplicated.
 * Blank cells never wipe a size that is already saved.
 */
import type { UniformStaff } from './clientUniforms'

export type ImportField =
  | 'client'
  | 'full_name'
  | 'employee_code'
  | 'department'
  | 'job_title'
  | 'shirt_size'
  | 'trouser_size'
  | 'jacket_size'
  | 'shoe_size'
  | 'cap_size'
  | 'other_sizes'
  | 'notes'

export const IMPORT_FIELDS: { field: ImportField; label: string; synonyms: string[] }[] = [
  { field: 'client', label: 'Client', synonyms: ['client', 'company', 'customer', 'client name', 'company name', 'employer'] },
  {
    field: 'full_name',
    label: 'Name',
    synonyms: ['name', 'full name', 'employee name', 'staff name', 'employee', 'staff', 'person', 'worker name'],
  },
  {
    field: 'employee_code',
    label: 'Employee no',
    synonyms: ['employee no', 'employee number', 'emp no', 'emp id', 'employee id', 'staff id', 'staff no', 'id', 'badge', 'code', 'emp code'],
  },
  { field: 'department', label: 'Department / site', synonyms: ['department', 'dept', 'site', 'location', 'branch', 'outlet', 'section'] },
  { field: 'job_title', label: 'Job title', synonyms: ['job title', 'title', 'designation', 'position', 'role', 'job'] },
  { field: 'shirt_size', label: 'Shirt size', synonyms: ['shirt', 'shirt size', 'top', 'top size', 't-shirt', 'tshirt', 'polo', 'tunic', 'chef coat'] },
  {
    field: 'trouser_size',
    label: 'Trousers size',
    synonyms: ['trouser', 'trousers', 'trouser size', 'pant', 'pants', 'pant size', 'bottom', 'bottoms', 'waist'],
  },
  { field: 'jacket_size', label: 'Jacket size', synonyms: ['jacket', 'jacket size', 'coat', 'blazer', 'vest', 'waistcoat'] },
  { field: 'shoe_size', label: 'Shoe size', synonyms: ['shoe', 'shoes', 'shoe size', 'boot', 'boots', 'safety shoes', 'footwear'] },
  { field: 'cap_size', label: 'Cap size', synonyms: ['cap', 'cap size', 'hat', 'head'] },
  { field: 'other_sizes', label: 'Other sizes', synonyms: ['other sizes', 'other size', 'other', 'measurements'] },
  { field: 'notes', label: 'Notes', synonyms: ['notes', 'note', 'remarks', 'comments', 'comment'] },
]

/** field → column index in the file (-1 = not in the file). */
export type ImportMapping = Record<ImportField, number>

export const UNIFORM_TEMPLATE_HEADERS = [
  'Client',
  'Name',
  'Employee no',
  'Department / site',
  'Job title',
  'Shirt size',
  'Trousers size',
  'Jacket size',
  'Shoe size',
  'Cap size',
  'Other sizes',
  'Notes',
]

export const UNIFORM_TEMPLATE_EXAMPLE = [
  'Example Hotel LLC',
  'Ali Hassan',
  'EMP-001',
  'Kitchen',
  'Chef',
  'L',
  '32',
  'L',
  '42',
  'M',
  'Apron long',
  'Delete this example row',
]

/** Row number columns: never a field, and never copied into Other sizes. */
const SERIAL_HEADERS = ['s no', 'sr no', 'sl no', 'sno', 'srno', 'slno', 'serial', 'serial no', 'serial number', 'no', '']

export function normHeader(h: string): string {
  return String(h || '')
    .toLowerCase()
    .replace(/[_.:#()/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fieldForHeader(h: string): ImportField | null {
  const n = normHeader(h)
  if (!n) return null
  // Exact synonym first, then "header starts with synonym" (e.g. "Shirt Size (S/M/L)").
  for (const f of IMPORT_FIELDS) if (f.synonyms.includes(n)) return f.field
  for (const f of IMPORT_FIELDS) {
    if (f.synonyms.some((s) => s.length > 2 && (n.startsWith(`${s} `) || n.endsWith(` ${s}`)))) return f.field
  }
  return null
}

/** The first row (within the first 10) that looks like headers; spreadsheets often have a title above. */
export function findHeaderRow(rows: string[][]): number {
  let best = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const score = rows[i].filter((c) => fieldForHeader(c)).length
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  }
  return best
}

export function emptyMapping(): ImportMapping {
  return Object.fromEntries(IMPORT_FIELDS.map((f) => [f.field, -1])) as ImportMapping
}

/** Match each field to a column by its header. Each column is used once. */
export function guessMapping(headers: string[]): ImportMapping {
  const map = emptyMapping()
  const used = new Set<number>()
  headers.forEach((h, i) => {
    const f = fieldForHeader(h)
    if (f && map[f] === -1 && !used.has(i)) {
      map[f] = i
      used.add(i)
    }
  })
  return map
}

export type ImportStatus = 'new' | 'update' | 'unchanged' | 'problem'

export type ImportLine = {
  /** Spreadsheet row number, as Excel shows it. */
  rowNumber: number
  status: ImportStatus
  problem?: string
  clientName: string
  clientId?: string
  existingId?: string
  values: Partial<Record<Exclude<ImportField, 'client'>, string>>
  /** Fields that will change on an existing person (labels for the preview). */
  changes: string[]
  /** Same, as column names, so an update only sends what changed. */
  changedFields: Exclude<ImportField, 'client'>[]
}

type ClientOpt = { id: string; company_name: string }

const PERSON_FIELDS: Exclude<ImportField, 'client'>[] = [
  'full_name',
  'employee_code',
  'department',
  'job_title',
  'shirt_size',
  'trouser_size',
  'jacket_size',
  'shoe_size',
  'cap_size',
  'other_sizes',
  'notes',
]

const FIELD_LABEL = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.field, f.label])) as Record<ImportField, string>

function norm(s: string | null | undefined): string {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Key a person is matched on: client + employee no, else client + name. */
export function personKey(clientId: string, employeeCode: string, fullName: string): string {
  return employeeCode.trim() ? `${clientId}|code|${norm(employeeCode)}` : `${clientId}|name|${norm(fullName)}`
}

export function planUniformImport(input: {
  rows: string[][]
  headerRow: number
  mapping: ImportMapping
  clients: ClientOpt[]
  existing: UniformStaff[]
  /** Used when the file has no client column, or a row leaves it blank. */
  defaultClientId?: string
  /** Put columns that are not matched into "Other sizes" as "Header: value". */
  keepOtherColumns?: boolean
}): ImportLine[] {
  const { rows, headerRow, mapping, clients, existing } = input
  const headers = rows[headerRow] || []
  const byName = new Map(clients.map((c) => [norm(c.company_name), c]))
  const byId = new Map(clients.map((c) => [c.id, c]))
  const mapped = new Set(Object.values(mapping).filter((i) => i >= 0))
  const extraCols = input.keepOtherColumns ? headers.map((_, i) => i).filter((i) => !mapped.has(i) && !SERIAL_HEADERS.includes(normHeader(headers[i] || ''))) : []

  const existingByKey = new Map<string, UniformStaff>()
  for (const s of existing) {
    if (s.employee_code.trim()) existingByKey.set(personKey(s.client_id, s.employee_code, ''), s)
    existingByKey.set(personKey(s.client_id, '', s.full_name), s)
  }

  const seen = new Map<string, number>()
  const lines: ImportLine[] = []

  for (let r = headerRow + 1; r < rows.length; r++) {
    const cells = rows[r]
    const cell = (f: ImportField) => (mapping[f] >= 0 ? String(cells[mapping[f]] ?? '').trim() : '')
    const values: ImportLine['values'] = {}
    for (const f of PERSON_FIELDS) values[f] = cell(f)
    if (extraCols.length) {
      const extra = extraCols
        .map((i) => [headers[i].trim(), String(cells[i] ?? '').trim()] as const)
        .filter(([, v]) => v)
        .map(([h, v]) => `${h}: ${v}`)
      if (extra.length) values.other_sizes = [values.other_sizes, ...extra].filter(Boolean).join(', ')
    }

    const rawClient = cell('client')
    const client = rawClient ? byName.get(norm(rawClient)) : input.defaultClientId ? byId.get(input.defaultClientId) : undefined
    const line: ImportLine = {
      rowNumber: r + 1,
      status: 'new',
      clientName: client?.company_name || rawClient,
      clientId: client?.id,
      values,
      changes: [],
      changedFields: [],
    }
    lines.push(line)

    // Skip rows that carry no person at all (e.g. a totals line).
    if (!values.full_name && !values.employee_code && PERSON_FIELDS.every((f) => !values[f])) {
      line.status = 'problem'
      line.problem = 'Empty row, skipped'
      continue
    }
    if (!values.full_name) {
      line.status = 'problem'
      line.problem = 'No name'
      continue
    }
    if (!client) {
      line.status = 'problem'
      line.problem = rawClient
        ? `Client "${rawClient}" is not in the clients list. Add it under Clients first, or fix the spelling.`
        : 'No client. Pick "Client for every row" or add a Client column.'
      continue
    }

    const key = personKey(client.id, values.employee_code || '', values.full_name)
    const dup = seen.get(key)
    if (dup) {
      line.status = 'problem'
      line.problem = `Same person as row ${dup}, skipped`
      continue
    }
    seen.set(key, line.rowNumber)

    const match =
      existingByKey.get(key) ||
      // A saved person without an employee no can still be found by name.
      existingByKey.get(personKey(client.id, '', values.full_name))
    if (!match || (match.employee_code.trim() && values.employee_code && norm(match.employee_code) !== norm(values.employee_code))) {
      line.status = 'new'
      continue
    }
    line.existingId = match.id
    for (const f of PERSON_FIELDS) {
      const v = values[f] || ''
      // Blank cells keep what is saved.
      const cur = String(match[f] ?? '').trim()
      // Name and employee no differing only in capitals or spacing is the same value.
      const same = f === 'full_name' || f === 'employee_code' ? norm(v) === norm(cur) : v === cur
      if (v && !same) {
        line.changes.push(FIELD_LABEL[f])
        line.changedFields.push(f)
      }
    }
    line.status = line.changes.length ? 'update' : 'unchanged'
  }
  return lines
}

export function importCounts(lines: ImportLine[]): Record<ImportStatus, number> {
  const out: Record<ImportStatus, number> = { new: 0, update: 0, unchanged: 0, problem: 0 }
  for (const l of lines) out[l.status]++
  return out
}

/** Row to insert for a new person, or only the changed, non-blank fields of an existing one. */
export function importPayload(line: ImportLine): Record<string, string> {
  const out: Record<string, string> = {}
  const fields = line.status === 'update' ? line.changedFields : PERSON_FIELDS
  for (const f of fields) {
    const v = (line.values[f] || '').trim()
    if (v) out[f] = v
  }
  return out
}
