import { currentAuthMode, db } from './db'
import { isMissingRelationError } from './errors'
import { tablesFor, type ExportMode, type ExportTable } from './clientExport'

type Row = Record<string, unknown>

async function rows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const { data, error } = await query
  if (error) {
    // A table from an item whose SQL has not been run yet: nothing to export.
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as Row[]
}

const PAGE = 1000

/** All matching rows. The cloud API returns at most 1000 at a time, so read page by page there. */
async function allRows(table: string, col: string, op: 'eq' | 'in', val: unknown): Promise<Row[]> {
  const base = () => {
    const q = db.from(table).select('*')
    return op === 'eq' ? q.eq(col, val) : q.in(col, val as unknown[])
  }
  if (currentAuthMode() === 'local') return rows(base())
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const page = await rows(base().order('id').range(from, from + PAGE - 1))
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

/** Reads every table in the export for one client, with the signed in person's access. */
export async function collectClientData(accountId: string, mode: ExportMode): Promise<{ spec: ExportTable; rows: Row[] }[]> {
  const specs = tablesFor(mode)
  const out: { spec: ExportTable; rows: Row[] }[] = []
  let ticketIds: string[] = []
  for (const spec of specs) {
    let found: Row[] = []
    if (spec.by === 'id') found = await allRows(spec.table, 'id', 'eq', accountId)
    else if (spec.by === 'account_id') found = await allRows(spec.table, 'account_id', 'eq', accountId)
    else {
      for (let i = 0; i < ticketIds.length; i += 100) {
        found.push(...(await allRows(spec.table, 'ticket_id', 'in', ticketIds.slice(i, i + 100))))
      }
    }
    if (spec.table === 'tickets') ticketIds = found.map((r) => String(r.id))
    const sorted = [...found].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    out.push({ spec, rows: sorted })
  }
  return out
}
