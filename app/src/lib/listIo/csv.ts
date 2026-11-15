/** Shared list CSV parse/serialize (M13 import/export framework). */

export function escapeCsvCell(value: unknown): string {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','))
  }
  return lines.join('\n') + '\n'
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
  if (!lines.length) return { headers: [], rows: [] }
  const headers = splitCsvLine(lines[0])
  const rows = lines.slice(1).map(splitCsvLine)
  return { headers, rows }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function csvRowsToObjects(
  headers: string[],
  rows: string[][],
): Array<Record<string, string>> {
  return rows.map((cells) => {
    const o: Record<string, string> = {}
    headers.forEach((h, i) => {
      o[h] = cells[i] ?? ''
    })
    return o
  })
}

export type ColumnMap = {
  key: string
  label: string
  required?: boolean
}

export function validateMappedRows(
  objects: Array<Record<string, string>>,
  columns: ColumnMap[],
): { ok: Array<Record<string, string>>; errors: string[] } {
  const ok: Array<Record<string, string>> = []
  const errors: string[] = []
  objects.forEach((row, idx) => {
    const missing = columns.filter((c) => c.required && !String(row[c.label] ?? row[c.key] ?? '').trim())
    if (missing.length) {
      errors.push(`Row ${idx + 2}: missing ${missing.map((m) => m.label).join(', ')}`)
      return
    }
    const normalized: Record<string, string> = {}
    for (const c of columns) {
      normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
    }
    ok.push(normalized)
  })
  return { ok, errors }
}
