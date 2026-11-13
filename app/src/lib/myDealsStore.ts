import { logActivity } from './activity'
import { db } from './db'
import { isMissingRelationError } from './errors'
import { listAccounts, listTeam } from './accountsStore'
import { listCommissions, listDeals as listCtrmDeals, listStageChanges, updateDeal } from './ctrmStore'
import { listSalesDeals, updateSalesDeal } from './salesPipelineStore'
import { CONTRACT_INVOICE_DIVISION_KEY, DEFAULT_CONTRACT_INVOICE_DIVISION } from './contractBilling'
import { crmMoveProblem, isLostReason, stageMoveProblem } from './dealRules'
import { dealProblem } from './ctrm'
import { salesDealProblem } from './salesPipeline'
import { planCrmAccountBackfill, type CrmLinkPlan } from './crmAccountLink'
import {
  applyMyDealPatchLocal,
  buildDealRows,
  crmOwnerText,
  dealAccess,
  targetStageForColumn,
  type BoardColumn,
  type DealRow,
  type MyDealPatch,
} from './myDeals'
import type { AppUser, CrmEntry, CtrmDeal, CtrmStage, Quotation, SalesStage, UserRole } from './types'

export type { MyDealPatch } from './myDeals'

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

/**
 * Loads the three pipelines for My deals. What a role may not see is never
 * fetched: no old CRM for staff, no commission for staff and viewers (RLS
 * would return none anyway).
 */
export async function loadMyDeals(
  role: UserRole | null | undefined,
  settings: Record<string, string | undefined>,
): Promise<{ deals: DealRow[]; team: AppUser[]; linkPlan: CrmLinkPlan }> {
  const access = dealAccess(role)
  const withCrm = access.pipelines.includes('crm')
  const emptyPlan: CrmLinkPlan = { unique: [], ambiguous: [], none: [] }
  const [team, accounts, sales, ctrm, changes, commissions, crm, quotations] = await Promise.all([
    listTeam(),
    listAccounts().then((r) => r.rows),
    listSalesDeals().then((r) => r.rows),
    listCtrmDeals(),
    listStageChanges(),
    access.commission ? listCommissions() : Promise.resolve([]),
    withCrm ? rows<CrmEntry>(db.from('crm').select('*')) : Promise.resolve([] as CrmEntry[]),
    withCrm
      ? rows<Quotation>(
          db
            .from('quotations')
            .select('client, reference_number, status, amount, base_amount, division_code')
            .in('status', ['Draft', 'Finalized', 'Sent', 'Awarded']),
        )
      : Promise.resolve([] as Quotation[]),
  ])
  const deals = buildDealRows({
    now: new Date(),
    users: team,
    accounts,
    crm,
    salesDeals: sales,
    ctrmDeals: ctrm,
    ctrmStageChanges: changes,
    commissions,
    quotations,
    salesDivision: settings[CONTRACT_INVOICE_DIVISION_KEY] || DEFAULT_CONTRACT_INVOICE_DIVISION,
    canSeeCommission: access.commission,
  })
  const linkPlan = withCrm ? planCrmAccountBackfill(crm, accounts) : emptyPlan
  return { deals, team, linkPlan }
}

type MoveAuthor = { appUserId: string | null; email: string }

export type MoveDealOpts = {
  /** Required when moving to Lost (any pipeline) or CRM Won. */
  outcomeReason?: string
  lostNote?: string
}

/**
 * Move a unified Pipeline deal to a shared board column (or an explicit stage).
 * Throws with a plain-language message when the pipeline's rules block the move.
 */
export async function moveMyDeal(
  deal: DealRow,
  next: { column?: BoardColumn; stage?: string },
  author: MoveAuthor,
  opts: MoveDealOpts = {},
): Promise<{ stageLabel: string }> {
  const stage = (next.stage || (next.column ? targetStageForColumn(deal.pipeline, next.column) : '')).trim()
  if (!stage) throw new Error('Pick a stage')
  if (stage === deal.stage) return { stageLabel: deal.stageLabel }

  if (deal.pipeline === 'crm') {
    return moveCrmDeal(deal, stage, author, opts)
  }
  if (deal.pipeline === 'sales') {
    return moveSalesDeal(deal, stage as SalesStage, author, opts)
  }
  return moveCtrmDeal(deal, stage as CtrmStage, author, opts)
}

async function moveCrmDeal(
  deal: DealRow,
  stage: string,
  author: MoveAuthor,
  opts: MoveDealOpts,
): Promise<{ stageLabel: string }> {
  const { data, error } = await db.from('crm').select('*').eq('id', deal.id).maybeSingle()
  if (error) throw error
  const entry = data as CrmEntry | null
  if (!entry) throw new Error('CRM deal not found')

  const outcome = (opts.outcomeReason || '').trim()
  const lostNote = (opts.lostNote || '').trim()
  if (stage === 'Lost' || stage === 'Won') {
    if (!outcome) throw new Error(`Add a ${stage.toLowerCase()} reason`)
    if (stage === 'Lost' && !isLostReason(outcome)) throw new Error('Pick why the deal was lost from the list')
    if (stage === 'Lost' && !lostNote) throw new Error('Add a note on why the deal was lost')
  }

  const problem = crmMoveProblem(entry, {
    pipeline_stage: stage,
    next_action: entry.next_action,
    follow_up_date: entry.follow_up_date,
    outcome_reason: stage === 'Won' || stage === 'Lost' ? outcome : entry.outcome_reason,
    lost_note: stage === 'Lost' ? lostNote : entry.lost_note,
  })
  if (problem) throw new Error(problem)

  const payload: Record<string, unknown> = {
    pipeline_stage: stage,
    updated_by: author.email,
    updated_at: new Date().toISOString(),
    stage_changed_at: new Date().toISOString(),
  }
  if (stage === 'Won' || stage === 'Lost') payload.outcome_reason = outcome
  if (stage === 'Lost') payload.lost_note = lostNote

  const { error: upd } = await db.from('crm').update(payload).eq('id', deal.id)
  if (upd) throw upd
  await logActivity(
    'quick_update_crm',
    'crm',
    entry.company_name,
    `pipeline_stage=${stage}`,
    author.email,
    deal.id,
  )
  return { stageLabel: stage }
}

async function moveSalesDeal(
  deal: DealRow,
  stage: SalesStage,
  author: MoveAuthor,
  opts: MoveDealOpts,
): Promise<{ stageLabel: string }> {
  const { rows } = await listSalesDeals()
  const row = rows.find((d) => d.id === deal.id)
  if (!row) throw new Error('Sales deal not found')

  if (stage === 'signed') {
    throw new Error('Open the account and use Make contract to mark AI CRM deals signed')
  }

  const lostCode = stage === 'lost' ? (opts.outcomeReason || '').trim() : row.lost_reason_code || ''
  const lostNote = stage === 'lost' ? (opts.lostNote || '').trim() : row.lost_reason || ''
  const draft = {
    ...row,
    stage,
    lost_reason_code: lostCode,
    lost_reason: lostNote,
  }
  const problem = salesDealProblem(draft)
  if (problem) throw new Error(problem)

  await updateSalesDeal(
    row,
    stage === 'lost'
      ? { stage, lost_reason_code: lostCode, lost_reason: lostNote }
      : { stage },
    author,
  )
  return { stageLabel: stage }
}

async function moveCtrmDeal(
  deal: DealRow,
  stage: CtrmStage,
  author: MoveAuthor,
  opts: MoveDealOpts,
): Promise<{ stageLabel: string }> {
  const rows = await listCtrmDeals()
  const row = rows.find((d) => d.id === deal.id) as CtrmDeal | undefined
  if (!row) throw new Error('CTRM deal not found')

  const lostCode = stage === 'lost' ? (opts.outcomeReason || '').trim() : row.lost_reason_code || ''
  const lostNote = stage === 'lost' ? (opts.lostNote || '').trim() : row.lost_reason || ''
  const draft = {
    ...row,
    stage,
    lost_reason_code: lostCode,
    lost_reason: lostNote,
  }
  const problem = dealProblem(draft)
  if (problem) throw new Error(problem)

  await updateDeal(
    row,
    stage === 'lost'
      ? { stage, lost_reason_code: lostCode, lost_reason: lostNote }
      : { stage },
    author,
  )
  return { stageLabel: stage }
}

/**
 * M3 write façade: patch next step / owner on any Pipeline deal.
 * Routes to the native table; does not merge schemas or touch deal value.
 */
export async function patchMyDeal(
  deal: DealRow,
  patch: MyDealPatch,
  author: MoveAuthor,
): Promise<void> {
  const keys = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined)
  if (!keys.length) return

  const merged = applyMyDealPatchLocal(deal, {
    ...patch,
    next_action: patch.next_action !== undefined ? patch.next_action.trim() : undefined,
  })
  if (deal.open) {
    const problem = stageMoveProblem({
      open: true,
      lost: false,
      next_action: merged.next_action,
      next_action_date: merged.next_action_date,
    })
    if (problem) throw new Error(problem)
  }

  if (deal.pipeline === 'crm') {
    await patchCrmDeal(deal, patch, author)
    return
  }
  if (deal.pipeline === 'sales') {
    await patchSalesDeal(deal, patch, author)
    return
  }
  await patchCtrmDeal(deal, patch, author)
}

async function patchCrmDeal(deal: DealRow, patch: MyDealPatch, author: MoveAuthor): Promise<void> {
  const { data, error } = await db.from('crm').select('*').eq('id', deal.id).maybeSingle()
  if (error) throw error
  const entry = data as CrmEntry | null
  if (!entry) throw new Error('CRM deal not found')

  const team = await listTeam()
  const payload: Record<string, unknown> = {
    updated_by: author.email,
    updated_at: new Date().toISOString(),
  }
  if (patch.next_action !== undefined) payload.next_action = patch.next_action.trim()
  if (patch.next_action_date !== undefined) payload.follow_up_date = patch.next_action_date
  if (patch.owner_user_id !== undefined) payload.owner = crmOwnerText(patch.owner_user_id, team)

  const { error: upd } = await db.from('crm').update(payload).eq('id', deal.id)
  if (upd) throw upd
  await logActivity(
    'quick_update_crm',
    'crm',
    entry.company_name,
    Object.keys(payload)
      .filter((k) => k !== 'updated_by' && k !== 'updated_at')
      .map((k) => `${k}=${String(payload[k] ?? '')}`)
      .join(', ') || 'patch',
    author.email,
    deal.id,
  )
}

async function patchSalesDeal(deal: DealRow, patch: MyDealPatch, author: MoveAuthor): Promise<void> {
  const { rows } = await listSalesDeals()
  const row = rows.find((d) => d.id === deal.id)
  if (!row) throw new Error('Sales deal not found')

  const next = {
    ...row,
    next_action: patch.next_action !== undefined ? patch.next_action.trim() : row.next_action,
    next_action_date:
      patch.next_action_date !== undefined ? patch.next_action_date : row.next_action_date,
    owner_user_id: patch.owner_user_id !== undefined ? patch.owner_user_id : row.owner_user_id,
  }
  const problem = salesDealProblem(next)
  if (problem) throw new Error(problem)

  const storePatch: Parameters<typeof updateSalesDeal>[1] = {}
  if (patch.next_action !== undefined) storePatch.next_action = patch.next_action.trim()
  if (patch.next_action_date !== undefined) storePatch.next_action_date = patch.next_action_date
  if (patch.owner_user_id !== undefined) storePatch.owner_user_id = patch.owner_user_id
  await updateSalesDeal(row, storePatch, author)
}

async function patchCtrmDeal(deal: DealRow, patch: MyDealPatch, author: MoveAuthor): Promise<void> {
  const rows = await listCtrmDeals()
  const row = rows.find((d) => d.id === deal.id) as CtrmDeal | undefined
  if (!row) throw new Error('CTRM deal not found')

  const next = {
    ...row,
    next_action: patch.next_action !== undefined ? patch.next_action.trim() : row.next_action,
    next_action_date:
      patch.next_action_date !== undefined ? patch.next_action_date : row.next_action_date,
    owner_user_id: patch.owner_user_id !== undefined ? patch.owner_user_id : row.owner_user_id,
  }
  const problem = dealProblem(next)
  if (problem) throw new Error(problem)

  const storePatch: Parameters<typeof updateDeal>[1] = {}
  if (patch.next_action !== undefined) storePatch.next_action = patch.next_action.trim()
  if (patch.next_action_date !== undefined) storePatch.next_action_date = patch.next_action_date
  if (patch.owner_user_id !== undefined) storePatch.owner_user_id = patch.owner_user_id
  await updateDeal(row, storePatch, author)
}
