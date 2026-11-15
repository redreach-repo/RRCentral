/** Zod validation for list CSV import rows (M13). */
import { z } from 'zod'
import { firstZodError } from '../schemas/common'
import type { ColumnMap } from './csv'

export function columnMapsToZod(columns: ColumnMap[]) {
  const shape: Record<string, z.ZodType<string>> = {}
  for (const c of columns) {
    let field: z.ZodType<string> = z.string().trim()
    if (c.required) {
      field = z.string().trim().min(1, `${c.label} is required`)
    }
    shape[c.key] = field
  }
  return z.object(shape)
}

export function parseListIoRow(
  row: Record<string, string>,
  columns: ColumnMap[],
): { ok: true; data: Record<string, string> } | { ok: false; error: string } {
  const schema = columnMapsToZod(columns)
  const result = schema.safeParse(row)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the CSV row') }
  }
  return { ok: true, data: result.data }
}

export function parseListIoRows(
  rows: Array<Record<string, string>>,
  columns: ColumnMap[],
): { ok: Array<Record<string, string>>; errors: string[] } {
  const ok: Array<Record<string, string>> = []
  const errors: string[] = []
  rows.forEach((row, idx) => {
    const parsed = parseListIoRow(row, columns)
    if (!parsed.ok) {
      errors.push(`Row ${idx + 2}: ${parsed.error}`)
      return
    }
    ok.push(parsed.data)
  })
  return { ok, errors }
}
