/** My Deals (Pipeline) CSV column map — matches export on MyDealsPage. */

import type { ColumnMap } from './listIo'
import { PIPELINE_LABELS, stagesForPipeline, type DealPipeline, type DealRow } from './myDeals'
import type { AppUser } from './types'

export const MY_DEALS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'pipeline', label: 'pipeline', required: true },
  { key: 'account', label: 'account', required: true },
  { key: 'deal', label: 'deal' },
  { key: 'stage', label: 'stage' },
  { key: 'value', label: 'value' },
  { key: 'weighted', label: 'weighted' },
  { key: 'next_action', label: 'next_action' },
  { key: 'next_action_date', label: 'next_action_date' },
  { key: 'days_in_stage', label: 'days_in_stage' },
  { key: 'owner', label: 'owner' },
  { key: 'source', label: 'source' },
  { key: 'division', label: 'division' },
  { key: 'quote_ref', label: 'quote_ref' },
]

export const MY_DEALS_CSV_HEADERS = MY_DEALS_CSV_COLUMNS.map((c) => c.key)

const PIPELINE_VALUES = new Set<DealPipeline>(['crm', 'sales', 'ctrm'])

export function resolvePipeline(raw: string): DealPipeline | null {
  const v = raw.trim()
  if (!v) return null
  const lower = v.toLowerCase()
  if (PIPELINE_VALUES.has(lower as DealPipeline)) return lower as DealPipeline
  for (const [key, label] of Object.entries(PIPELINE_LABELS) as [DealPipeline, string][]) {
    if (label.toLowerCase() === lower) return key
  }
  return null
}

/** Resolve export stage label or native stage value for a pipeline. */
export function resolveDealStage(pipeline: DealPipeline, raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const stages = stagesForPipeline(pipeline)
  const byValue = stages.find((s) => s.value === v || s.value.toLowerCase() === v.toLowerCase())
  if (byValue) return byValue.value
  const byLabel = stages.find((s) => s.label.toLowerCase() === v.toLowerCase())
  return byLabel?.value ?? null
}

export function resolveOwnerUserId(
  raw: string,
  team: Pick<AppUser, 'id' | 'name' | 'email'>[],
): string | null | undefined {
  const v = raw.trim()
  if (!v) return null
  const lower = v.toLowerCase()
  const byName = team.find((u) => (u.name || '').trim().toLowerCase() === lower)
  if (byName) return byName.id
  const byEmail = team.find((u) => (u.email || '').trim().toLowerCase() === lower)
  if (byEmail) return byEmail.id
  return undefined
}

function parseYmd(raw: string): string | null | undefined {
  const v = raw.trim()
  if (!v) return null
  const day = v.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
}

/** Terminal stages that need an outcome reason — skip stage moves on import. */
export function isTerminalDealStage(pipeline: DealPipeline, stage: string): boolean {
  const s = stage.toLowerCase()
  if (pipeline === 'crm') return stage === 'Won' || stage === 'Lost'
  if (pipeline === 'sales') return s === 'signed' || s === 'lost'
  return s === 'signed' || s === 'lost'
}

/**
 * Find the best matching loaded deal for a CSV row (pipeline + account,
 * then deal title). Consumes matches from `remaining` so one deal maps once.
 */
export function takeMatchingDeal(
  remaining: DealRow[],
  pipeline: DealPipeline,
  account: string,
  dealTitle: string,
): DealRow | null {
  const accountKey = account.trim().toLowerCase()
  const dealKey = dealTitle.trim().toLowerCase()
  const candidates = remaining.filter(
    (d) => d.pipeline === pipeline && d.account.trim().toLowerCase() === accountKey,
  )
  if (!candidates.length) return null
  const titled = dealKey
    ? candidates.find((d) => d.deal.trim().toLowerCase() === dealKey)
    : undefined
  const pick = titled || candidates[0]
  const idx = remaining.findIndex((d) => d.key === pick.key)
  if (idx >= 0) remaining.splice(idx, 1)
  return pick
}

export type MyDealCsvPatch = {
  next_action?: string
  next_action_date?: string | null
  owner_user_id?: string | null
  source?: string
  quote_ref?: string
}

/**
 * Build a patch from CSV fields vs the matched deal. Blank next-step cells keep
 * the current values (so a round-trip export does not clear open deals).
 * Returns null when owner/date cannot be resolved.
 */
export function buildMyDealCsvPatch(
  row: Record<string, string>,
  deal: DealRow,
  team: Pick<AppUser, 'id' | 'name' | 'email'>[],
): MyDealCsvPatch | null {
  const patch: MyDealCsvPatch = {}
  const nextAction = String(row.next_action || '').trim()
  if (nextAction && nextAction !== deal.next_action) {
    patch.next_action = nextAction
  }
  const dateRaw = String(row.next_action_date || '').trim()
  if (dateRaw) {
    const date = parseYmd(dateRaw)
    if (date === undefined) return null
    if (date !== deal.next_action_date) patch.next_action_date = date
  }
  if (Object.prototype.hasOwnProperty.call(row, 'owner')) {
    const owner = resolveOwnerUserId(String(row.owner || ''), team)
    if (owner === undefined) return null
    if (owner !== deal.owner_user_id) patch.owner_user_id = owner
  }
  if (deal.pipeline === 'crm') {
    const quoteRef = String(row.quote_ref || '').trim()
    if (quoteRef && quoteRef !== deal.quote_ref) patch.quote_ref = quoteRef
  } else {
    const source = String(row.source || '').trim()
    if (source && source !== deal.source) patch.source = source
  }
  return patch
}
