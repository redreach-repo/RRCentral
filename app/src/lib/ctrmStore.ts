import { db } from './db'
import { lostText } from './dealRules'
import { isMissingRelationError } from './errors'
import { createAccount, logAccountEvent } from './accountsStore'
import { stageLabel } from './ctrm'
import { checkFitSheetForStage } from './fitSheetStore'
import { fitSheetStageProblem, stageNeedsFitSheet } from './fitSheet'
import type { CtrmCommission, CtrmDeal, CtrmStage, CtrmStageChange } from './types'

type Author = { appUserId: string | null; email: string }

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

export async function listDeals(accountId?: string): Promise<CtrmDeal[]> {
  let q = db.from('ctrm_deals').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  return rows<CtrmDeal>(q.order('created_at', { ascending: false }))
}

export async function listStageChanges(sinceIso?: string): Promise<CtrmStageChange[]> {
  let q = db.from('ctrm_deal_stage_changes').select('*')
  if (sinceIso) q = q.gte('changed_at', sinceIso)
  return rows<CtrmStageChange>(q)
}

/** Red Reach's commission per deal. RLS returns nothing to staff and viewers. */
export async function listCommissions(): Promise<CtrmCommission[]> {
  return rows<CtrmCommission>(db.from('ctrm_deal_commissions').select('*'))
}

export type DealInput = Omit<CtrmDeal, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'last_touch_at'>

async function recordStage(dealId: string, from: string, to: CtrmStage, author: Author, at: string) {
  check(
    await db.from('ctrm_deal_stage_changes').insert({
      id: crypto.randomUUID(),
      deal_id: dealId,
      from_stage: from,
      to_stage: to,
      changed_by: author.email,
      changed_at: at,
    }),
  )
}

export async function createDeal(input: DealInput, author: Author): Promise<string> {
  await checkFitSheetForStage(input.account_id, '', input.stage)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  check(
    await db.from('ctrm_deals').insert({
      ...input,
      id,
      last_touch_at: now,
      created_by: author.email,
      created_at: now,
      updated_at: now,
    }),
  )
  await recordStage(id, '', input.stage, author, now)
  await logAccountEvent(input.account_id, `CTRM Next deal added at ${stageLabel(input.stage)}`, author)
  return id
}

/** Saves a deal. A stage change counts as a touch and goes on the stage history and timeline. */
export async function updateDeal(deal: CtrmDeal, patch: Partial<DealInput>, author: Author): Promise<void> {
  const now = new Date().toISOString()
  const moved = patch.stage && patch.stage !== deal.stage
  if (moved && patch.stage) await checkFitSheetForStage(deal.account_id, deal.stage, patch.stage)
  const next: Record<string, unknown> = { ...patch, updated_at: now }
  if (moved) next.last_touch_at = now
  if (patch.stage && patch.stage !== 'lost') {
    next.lost_reason = ''
    if (deal.lost_reason_code) next.lost_reason_code = ''
  }
  check(await db.from('ctrm_deals').update(next).eq('id', deal.id))
  if (moved && patch.stage) {
    await recordStage(deal.id, deal.stage, patch.stage, author, now)
    const reason =
      patch.stage === 'lost' && (patch.lost_reason_code || patch.lost_reason)
        ? ` (${lostText(patch.lost_reason_code || '', patch.lost_reason || '')})`
        : ''
    await logAccountEvent(
      deal.account_id,
      `CTRM Next stage moved from ${stageLabel(deal.stage)} to ${stageLabel(patch.stage)}${reason}`,
      author,
    )
  }
}

/** Marks that someone spoke to the prospect today, and notes it on the timeline. */
export async function logTouch(deal: CtrmDeal, note: string, author: Author): Promise<void> {
  const now = new Date().toISOString()
  check(await db.from('ctrm_deals').update({ last_touch_at: now, updated_at: now }).eq('id', deal.id))
  await logAccountEvent(deal.account_id, `CTRM Next touch: ${note || 'spoke to them'}`, author)
}

export async function saveCommission(
  dealId: string,
  existing: CtrmCommission | undefined,
  input: Pick<CtrmCommission, 'expected_commission' | 'commission_received'>,
): Promise<void> {
  const now = new Date().toISOString()
  if (existing) {
    check(await db.from('ctrm_deal_commissions').update({ ...input, updated_at: now }).eq('deal_id', dealId))
    return
  }
  check(
    await db
      .from('ctrm_deal_commissions')
      .insert({ ...input, id: crypto.randomUUID(), deal_id: dealId, currency: 'AED', updated_at: now }),
  )
}

/** Saves the deal form: creates the prospect account if it is new, the deal, and Red Reach's commission. */
export async function saveDealForm(
  values: {
    accountId: string
    newCompany: string
    commission: { expected: number; received: number } | null
  } & Omit<DealInput, 'account_id'>,
  deal: CtrmDeal | null,
  existingCommission: CtrmCommission | undefined,
  knownRefs: string[],
  author: Author,
): Promise<{ dealId: string; accountId: string }> {
  let accountId = values.accountId
  // A new company has no fit sheet yet, so it starts before Demo done.
  if (!accountId && stageNeedsFitSheet('', values.stage)) {
    throw new Error(`${fitSheetStageProblem(['the whole sheet'])} Save the deal at an earlier stage first, then fill in the fit sheet on the account.`)
  }
  if (!accountId) {
    const account = await createAccount(
      {
        type: 'ctrm_prospect',
        name: values.newCompany.trim(),
        industry: '',
        country: values.region === 'india' ? 'India' : '',
        city: '',
        website: '',
        status: 'active',
        owner_user_id: values.owner_user_id,
        source: values.source,
        notes: '',
      },
      author.email,
      knownRefs,
    )
    accountId = account.id
    await logAccountEvent(accountId, 'Account created as CTRM Next prospect', author)
  }
  const input: DealInput = {
    account_id: accountId,
    stage: values.stage,
    region: values.region,
    company_type: values.company_type,
    primary_contact_id: values.primary_contact_id,
    source: values.source,
    owner_user_id: values.owner_user_id,
    next_action: values.next_action.trim(),
    next_action_date: values.next_action_date,
    lost_reason: values.stage === 'lost' ? values.lost_reason.trim() : '',
    ...(values.stage === 'lost' ? { lost_reason_code: values.lost_reason_code } : {}),
    notes: values.notes,
  }
  let dealId = deal?.id ?? ''
  if (deal) await updateDeal(deal, input, author)
  else dealId = await createDeal(input, author)
  if (values.commission) {
    const changed =
      !existingCommission ||
      Number(existingCommission.expected_commission) !== values.commission.expected ||
      Number(existingCommission.commission_received) !== values.commission.received
    if (changed && (existingCommission || values.commission.expected || values.commission.received)) {
      await saveCommission(dealId, existingCommission, {
        expected_commission: values.commission.expected,
        commission_received: values.commission.received,
      })
    }
  }
  return { dealId, accountId }
}
