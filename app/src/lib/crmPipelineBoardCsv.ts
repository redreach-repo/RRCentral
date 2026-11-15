/** CRM pipeline board CSV column map — matches export on CrmPipelineBoard. */

import type { ColumnMap } from './listIo'
import type { CrmEntry } from './types'

export const CRM_PIPELINE_BOARD_CSV_COLUMNS: ColumnMap[] = [
  { key: 'company_name', label: 'company_name', required: true },
  { key: 'pipeline_stage', label: 'pipeline_stage' },
  { key: 'owner', label: 'owner' },
  { key: 'follow_up_date', label: 'follow_up_date' },
  { key: 'next_action', label: 'next_action' },
  { key: 'contact', label: 'contact' },
  { key: 'phone', label: 'phone' },
  { key: 'email', label: 'email' },
  { key: 'quote_ref', label: 'quote_ref' },
  { key: 'follow_up_bucket', label: 'follow_up_bucket' },
]

export const CRM_PIPELINE_BOARD_CSV_HEADERS = CRM_PIPELINE_BOARD_CSV_COLUMNS.map((c) => c.key)

/** Resolve stage value against the board's stage list (case-insensitive). */
export function resolveCrmBoardStage(raw: string, stages: readonly string[]): string | null {
  const v = raw.trim()
  if (!v) return null
  const exact = stages.find((s) => s === v)
  if (exact) return exact
  const lower = v.toLowerCase()
  return stages.find((s) => s.toLowerCase() === lower) || null
}

/** Terminal CRM stages that need an outcome reason — skip stage moves on import. */
export function isTerminalCrmBoardStage(stage: string): boolean {
  return stage === 'Won' || stage === 'Lost'
}

function parseYmd(raw: string): string | null | undefined {
  const v = raw.trim()
  if (!v) return null
  const day = v.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
}

/**
 * Find the best matching board entry for a CSV row by company name.
 * Prefers quote_ref when several share a name. Consumes matches from `remaining`.
 */
export function takeMatchingCrmEntry(
  remaining: CrmEntry[],
  companyName: string,
  quoteRef: string,
): CrmEntry | null {
  const companyKey = companyName.trim().toLowerCase()
  if (!companyKey) return null
  const candidates = remaining.filter((e) => e.company_name.trim().toLowerCase() === companyKey)
  if (!candidates.length) return null
  const refKey = quoteRef.trim().toLowerCase()
  const byRef = refKey
    ? candidates.find((e) => (e.quote_ref || '').trim().toLowerCase() === refKey)
    : undefined
  const pick = byRef || candidates[0]
  const idx = remaining.findIndex((e) => e.id === pick.id)
  if (idx >= 0) remaining.splice(idx, 1)
  return pick
}

export type CrmBoardCsvPatch = {
  owner?: string
  follow_up_date?: string | null
  next_action?: string
  quote_ref?: string
}

/**
 * Build a field patch from CSV vs the matched entry. Blank cells keep current
 * values so a round-trip export does not clear open deals. Returns null when
 * follow_up_date cannot be parsed.
 */
export function buildCrmBoardCsvPatch(
  row: Record<string, string>,
  entry: CrmEntry,
): CrmBoardCsvPatch | null {
  const patch: CrmBoardCsvPatch = {}
  if (Object.prototype.hasOwnProperty.call(row, 'owner')) {
    const owner = String(row.owner || '').trim()
    if (owner !== (entry.owner || '')) patch.owner = owner
  }
  const dateRaw = String(row.follow_up_date || '').trim()
  if (dateRaw) {
    const date = parseYmd(dateRaw)
    if (date === undefined) return null
    const current = entry.follow_up_date ? String(entry.follow_up_date).slice(0, 10) : null
    if (date !== current) patch.follow_up_date = date
  }
  const nextAction = String(row.next_action || '').trim()
  if (nextAction && nextAction !== (entry.next_action || '')) {
    patch.next_action = nextAction
  }
  const quoteRef = String(row.quote_ref || '').trim()
  if (quoteRef && quoteRef !== (entry.quote_ref || '')) {
    patch.quote_ref = quoteRef
  }
  return patch
}
