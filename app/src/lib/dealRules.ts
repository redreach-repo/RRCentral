import { format } from 'date-fns'
import { CRM_OUTCOME_REASONS } from './config'
import type { CrmEntry, CtrmDeal, SalesDeal } from './types'

/**
 * The rules every pipeline follows when a deal moves (original CRM, AI CRM
 * sales, CTRM Next):
 *
 * - into an open stage: it needs a next action and the date for it;
 * - to Lost: a reason from the short list below plus a note in words.
 *
 * The database checks the same on every stage move
 * (20261114090000_deal_next_step_rules.sql), so no screen can skip it.
 */

/** The short list of reasons a deal is lost. Same list as the CRM Won/Lost reasons. */
export const LOST_REASONS = CRM_OUTCOME_REASONS
export type LostReason = (typeof LOST_REASONS)[number]

export function isLostReason(value: string | null | undefined): value is LostReason {
  return (LOST_REASONS as readonly string[]).includes(String(value || ''))
}

export type StageMove = {
  /** True when the stage it moves to is still open (not won, signed or lost). */
  open: boolean
  lost: boolean
  next_action: string | null | undefined
  next_action_date: string | null | undefined
  lost_reason_code?: string | null
  lost_note?: string | null
}

/** Why a move cannot be saved, in words, or null when it is fine. */
export function stageMoveProblem(m: StageMove): string | null {
  if (m.lost) {
    if (!isLostReason(m.lost_reason_code)) return 'Pick why the deal was lost'
    if (!String(m.lost_note || '').trim()) return 'Add a note on why the deal was lost'
    return null
  }
  if (m.open) {
    if (!String(m.next_action || '').trim()) return 'Every open deal needs a next action'
    if (!m.next_action_date) return 'Give the next action a date'
  }
  return null
}

/** The line written on the timeline or activity log when a deal is lost. */
export function lostText(code: string, note: string): string {
  return [code.trim(), note.trim()].filter(Boolean).join(': ')
}

// ---------------------------------------------------------------------------
// Dashboard: open deals with no next step
// ---------------------------------------------------------------------------

export type NoNextStepRow = {
  key: string
  pipeline: 'crm' | 'sales' | 'ctrm'
  name: string
  stage: string
  /** What is missing, in words. */
  missing: string
  link: string
  owner_user_id: string | null
  owner_label: string
}

export type NoNextStepInput = {
  users: { id: string; name: string; email: string }[]
  accountNames: Map<string, string>
  crm: Pick<CrmEntry, 'id' | 'company_name' | 'owner' | 'pipeline_stage' | 'next_action' | 'follow_up_date'>[]
  salesDeals: Pick<SalesDeal, 'id' | 'account_id' | 'stage' | 'owner_user_id' | 'next_action' | 'next_action_date'>[]
  ctrmDeals: Pick<CtrmDeal, 'id' | 'account_id' | 'stage' | 'owner_user_id' | 'next_action' | 'next_action_date'>[]
}

function missingOf(action: string | null | undefined, date: string | null | undefined): string | null {
  const a = String(action || '').trim()
  if (!a && !date) return 'No next action or date'
  if (!a) return 'No next action'
  if (!date) return 'No date for the next action'
  return null
}

/**
 * Open deals without a next action or its date. Deals saved before the rule
 * (or moved in by the lead intake) end up here, so someone gives them one.
 */
export function noNextStep(input: NoNextStepInput): NoNextStepRow[] {
  const userName = new Map(input.users.map((u) => [u.id, u.name || u.email]))
  const byName = new Map(input.users.filter((u) => u.name).map((u) => [u.name.trim().toLowerCase(), u]))
  const rows: NoNextStepRow[] = []
  for (const c of input.crm) {
    const stage = c.pipeline_stage || 'Lead'
    if (stage === 'Won' || stage === 'Lost') continue
    const missing = missingOf(c.next_action, c.follow_up_date)
    if (!missing) continue
    const login = byName.get(String(c.owner || '').trim().toLowerCase())
    rows.push({
      key: `crm:${c.id}`,
      pipeline: 'crm',
      name: c.company_name || 'CRM lead',
      stage,
      missing,
      link: `/crm?edit=${c.id}`,
      owner_user_id: login?.id ?? null,
      owner_label: login ? login.name : String(c.owner || ''),
    })
  }
  const deal = (pipeline: 'sales' | 'ctrm', d: NoNextStepInput['salesDeals'][number] | NoNextStepInput['ctrmDeals'][number]) => {
    if (d.stage === 'signed' || d.stage === 'lost') return
    const missing = missingOf(d.next_action, d.next_action_date)
    if (!missing) return
    rows.push({
      key: `${pipeline}:${d.id}`,
      pipeline,
      name: input.accountNames.get(d.account_id) || (pipeline === 'sales' ? 'AI CRM prospect' : 'CTRM prospect'),
      stage: d.stage,
      missing,
      link: `/accounts/${d.account_id}`,
      owner_user_id: d.owner_user_id && userName.has(d.owner_user_id) ? d.owner_user_id : null,
      owner_label: (d.owner_user_id && userName.get(d.owner_user_id)) || '',
    })
  }
  for (const d of input.salesDeals) deal('sales', d)
  for (const d of input.ctrmDeals) deal('ctrm', d)
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/** Three working days from today, the usual date for a new next action. */
export function defaultNextActionDate(now: Date = new Date()): string {
  const d = new Date(now)
  let added = 0
  while (added < 3) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return format(d, 'yyyy-MM-dd')
}

type CrmStageFields = Pick<CrmEntry, 'pipeline_stage' | 'next_action' | 'follow_up_date'> & {
  outcome_reason?: string
  lost_note?: string
}

/**
 * The same rule for a CRM row: only checked when the stage changes. Screens
 * with no reason fields (log a touch, follow-ups) send Lost moves to the
 * stage menu, where the reason is asked for.
 */
export function crmMoveProblem(
  before: Pick<CrmEntry, 'pipeline_stage'>,
  after: CrmStageFields,
  opts: { askedForReason: boolean } = { askedForReason: true },
): string | null {
  const from = before.pipeline_stage || 'Lead'
  const to = after.pipeline_stage || 'Lead'
  if (from === to) return null
  if (to === 'Lost' && !opts.askedForReason) return 'Mark it Lost from the stage menu, so the reason is recorded'
  return stageMoveProblem({
    open: to !== 'Won' && to !== 'Lost',
    lost: to === 'Lost',
    next_action: after.next_action,
    next_action_date: after.follow_up_date,
    lost_reason_code: after.outcome_reason,
    lost_note: after.lost_note,
  })
}
