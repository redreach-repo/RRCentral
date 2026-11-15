/** No-next-step dashboard CSV — matches export on NoNextStepCard. */

import { defaultNextActionDate, type NoNextStepRow } from './dealRules'
import type { DealRow } from './myDeals'

export const NO_NEXT_STEP_PIPELINE_LABELS: Record<NoNextStepRow['pipeline'], string> = {
  crm: 'CRM',
  sales: 'AI CRM sales',
  ctrm: 'CTRM Next',
}

/** Export / import headers. next_action + next_action_date are filled on import to clear the gap. */
export const NO_NEXT_STEP_CSV_HEADERS = [
  'name',
  'pipeline',
  'stage',
  'missing',
  'owner',
  'link',
  'next_action',
  'next_action_date',
] as const

const PIPELINE_VALUES = new Set<NoNextStepRow['pipeline']>(['crm', 'sales', 'ctrm'])

export function resolveNoNextStepPipeline(raw: string): NoNextStepRow['pipeline'] | null {
  const v = raw.trim()
  if (!v) return null
  const lower = v.toLowerCase()
  if (PIPELINE_VALUES.has(lower as NoNextStepRow['pipeline'])) return lower as NoNextStepRow['pipeline']
  for (const [key, label] of Object.entries(NO_NEXT_STEP_PIPELINE_LABELS) as [NoNextStepRow['pipeline'], string][]) {
    if (label.toLowerCase() === lower) return key
  }
  return null
}

function parseYmd(raw: string): string | null | undefined {
  const v = raw.trim()
  if (!v) return null
  const day = v.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
}

/**
 * Match a loaded gap row. Prefer link (unique), then name + pipeline (+ stage when set).
 * Consumes from `remaining` so one deal maps once.
 */
export function takeMatchingNoNextStep(
  remaining: NoNextStepRow[],
  row: Record<string, string>,
): NoNextStepRow | null {
  const link = String(row.link || '').trim()
  if (link) {
    const byLink = remaining.find((r) => r.link === link)
    if (byLink) {
      const idx = remaining.findIndex((r) => r.key === byLink.key)
      if (idx >= 0) remaining.splice(idx, 1)
      return byLink
    }
  }
  const name = String(row.name || '').trim().toLowerCase()
  const pipeline = resolveNoNextStepPipeline(String(row.pipeline || ''))
  if (!name || !pipeline) return null
  const stage = String(row.stage || '').trim().toLowerCase()
  const candidates = remaining.filter(
    (r) => r.pipeline === pipeline && r.name.trim().toLowerCase() === name && (!stage || r.stage.toLowerCase() === stage),
  )
  if (!candidates.length) return null
  const pick = candidates[0]
  const idx = remaining.findIndex((r) => r.key === pick.key)
  if (idx >= 0) remaining.splice(idx, 1)
  return pick
}

export type NoNextStepCsvPatch = {
  next_action: string
  next_action_date: string
}

/**
 * Build a next-step patch from CSV cells. Blank cells keep the current values;
 * a blank date with a new action uses the usual three-working-day default.
 * Returns null when nothing can be written (still missing action or date).
 */
export function buildNoNextStepCsvPatch(
  row: Record<string, string>,
  current: NoNextStepRow,
  now: Date = new Date(),
): NoNextStepCsvPatch | null {
  const csvAction = String(row.next_action || '').trim()
  const csvDateRaw = String(row.next_action_date || '').trim()
  const nextAction = csvAction || current.next_action
  let nextDate: string | null = current.next_action_date
  if (csvDateRaw) {
    const parsed = parseYmd(csvDateRaw)
    if (parsed === undefined) return null
    nextDate = parsed
  } else if (csvAction && !nextDate) {
    nextDate = defaultNextActionDate(now)
  }
  if (!nextAction || !nextDate) return null
  if (nextAction === current.next_action && nextDate === current.next_action_date) return null
  return { next_action: nextAction, next_action_date: nextDate }
}

/** Minimal DealRow so import can call patchMyDeal (pipeline + id + current next step). */
export function noNextStepToDealStub(r: NoNextStepRow): DealRow {
  const colon = r.key.indexOf(':')
  const id = colon >= 0 ? r.key.slice(colon + 1) : r.key
  return {
    key: r.key,
    pipeline: r.pipeline,
    id,
    account: r.name,
    account_id: null,
    deal: '',
    stage: r.stage,
    stageLabel: r.stage,
    column: 'new',
    open: true,
    value: null,
    weighted: null,
    next_action: r.next_action || '',
    next_action_date: r.next_action_date,
    overdue: false,
    days_in_stage: 0,
    owner_user_id: r.owner_user_id,
    owner_label: r.owner_label,
    source: '',
    notes: '',
    quote_ref: '',
    division: '',
    link: r.link,
  }
}
