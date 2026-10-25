import { db } from './db'
import { lostText } from './dealRules'
import { isMissingRelationError } from './errors'
import { createAccount, logAccountEvent, updateAccount } from './accountsStore'
import { saveContract } from './deliveryStore'
import { formatAED } from './money'
import { contractFromQuote, hasQuote, salesStageLabel, startLabel } from './salesPipeline'
import type { Account, SalesDeal } from './types'

type Author = { appUserId: string | null; email: string }

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

export async function listSalesDeals(accountId?: string): Promise<{ rows: SalesDeal[]; missingTable: boolean }> {
  let q = db.from('sales_deals').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as SalesDeal[], missingTable: false }
}

export type SalesDealInput = Omit<
  SalesDeal,
  'id' | 'account_id' | 'contract_id' | 'signed_at' | 'quote_sent_at' | 'last_touch_at' | 'created_by' | 'created_at' | 'updated_at'
>

/** Saves a deal. A stage change counts as a touch and goes on the account timeline. */
export async function updateSalesDeal(deal: SalesDeal, patch: Partial<SalesDealInput>, author: Author): Promise<void> {
  const now = new Date().toISOString()
  const moved = patch.stage && patch.stage !== deal.stage
  const next: Record<string, unknown> = { ...patch, updated_at: now }
  if (moved) next.last_touch_at = now
  if (patch.stage && patch.stage !== 'lost') {
    next.lost_reason = ''
    if (deal.lost_reason_code) next.lost_reason_code = ''
  }
  if (patch.stage === 'quote_sent' && !deal.quote_sent_at) next.quote_sent_at = now
  check(await db.from('sales_deals').update(next).eq('id', deal.id))
  if (moved && patch.stage) {
    const reason =
      patch.stage === 'lost' && (patch.lost_reason_code || patch.lost_reason)
        ? ` (${lostText(patch.lost_reason_code || '', patch.lost_reason || '')})`
        : ''
    await logAccountEvent(
      deal.account_id,
      `Sales stage moved from ${salesStageLabel(deal.stage)} to ${salesStageLabel(patch.stage)}${reason}`,
      author,
    )
  }
}

/** Marks that someone spoke to the prospect today. */
export async function logSalesTouch(deal: SalesDeal, author: Author): Promise<void> {
  const now = new Date().toISOString()
  check(await db.from('sales_deals').update({ last_touch_at: now, updated_at: now }).eq('id', deal.id))
  await logAccountEvent(deal.account_id, 'Sales touch: spoke to them', author)
}

/** Saves the deal form: creates the prospect account if it is new, then the deal. */
export async function saveSalesDealForm(
  values: { accountId: string; newCompany: string } & SalesDealInput,
  deal: SalesDeal | null,
  knownRefs: string[],
  author: Author,
): Promise<{ dealId: string; accountId: string }> {
  let accountId = values.accountId
  if (!accountId) {
    const account = await createAccount(
      {
        type: 'ai_crm_client',
        name: values.newCompany.trim(),
        industry: '',
        country: '',
        city: '',
        website: '',
        status: 'prospect',
        owner_user_id: values.owner_user_id,
        source: values.source,
        notes: '',
      },
      author.email,
      knownRefs,
    )
    accountId = account.id
    await logAccountEvent(accountId, 'Account created as an AI CRM prospect', author)
  }
  const { accountId: _a, newCompany: _n, ...rest } = values
  const input: SalesDealInput = {
    ...rest,
    next_action: rest.next_action.trim(),
    lost_reason: rest.stage === 'lost' ? rest.lost_reason.trim() : '',
    ...(rest.stage === 'lost' ? { lost_reason_code: rest.lost_reason_code || '' } : { lost_reason_code: undefined }),
    quote_reference: rest.quote_reference.trim(),
  }
  if (deal) {
    await updateSalesDeal(deal, input, author)
    return { dealId: deal.id, accountId }
  }
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  check(
    await db.from('sales_deals').insert({
      ...input,
      id,
      account_id: accountId,
      contract_id: null,
      signed_at: null,
      quote_sent_at: input.stage === 'quote_sent' ? now : null,
      last_touch_at: now,
      created_by: author.email,
      created_at: now,
      updated_at: now,
    }),
  )
  await logAccountEvent(accountId, `Sales deal added at ${salesStageLabel(input.stage)}`, author)
  return { dealId: id, accountId }
}

/**
 * Make contract: the quote becomes the client's contract, the deal moves to
 * Signed and a prospect account becomes onboarding. Safe to press twice: only
 * the first press links a contract to the deal.
 */
export async function makeContractFromDeal(
  deal: SalesDeal,
  account: Pick<Account, 'id' | 'status'> | undefined,
  author: Author,
): Promise<string> {
  const { data: fresh, error } = await db.from('sales_deals').select('*').eq('id', deal.id).maybeSingle()
  if (error) throw error
  const current = (fresh as SalesDeal | null) ?? deal
  if (current.contract_id) return current.contract_id
  if (!hasQuote(current)) throw new Error('Add the package and fees that were quoted first')

  const contract = contractFromQuote(current)
  const contractId = await saveContract(current.account_id, contract)
  const now = new Date().toISOString()
  const { data: claimed, error: claimError } = await db
    .from('sales_deals')
    .update({
      stage: 'signed',
      contract_id: contractId,
      signed_at: now,
      lost_reason: '',
      last_touch_at: now,
      updated_at: now,
    })
    .eq('id', deal.id)
    .is('contract_id', null)
    .select('id')
  if (claimError || !claimed || (claimed as unknown[]).length === 0) {
    // Someone else made the contract first: remove this one.
    await db.from('contracts').delete().eq('id', contractId)
    if (claimError) throw claimError
    throw new Error('This deal already has a contract. Reload the page.')
  }
  if (account?.status === 'prospect') await updateAccount(current.account_id, { status: 'onboarding' })
  await logAccountEvent(
    current.account_id,
    `Signed: contract made from the quote, ${formatAED(contract.monthly_fee)} a month${
      contract.setup_fee ? ` plus ${formatAED(contract.setup_fee)} setup` : ''
    }, starting ${startLabel(contract.term_start)}`,
    author,
  )
  return contractId
}
