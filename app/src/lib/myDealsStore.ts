import { db } from './db'
import { isMissingRelationError } from './errors'
import { listAccounts, listTeam } from './accountsStore'
import { listCommissions, listDeals as listCtrmDeals, listStageChanges } from './ctrmStore'
import { listSalesDeals } from './salesPipelineStore'
import { CONTRACT_INVOICE_DIVISION_KEY, DEFAULT_CONTRACT_INVOICE_DIVISION } from './contractBilling'
import { buildDealRows, dealAccess, type DealRow } from './myDeals'
import type { AppUser, CrmEntry, Quotation, UserRole } from './types'

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
): Promise<{ deals: DealRow[]; team: AppUser[] }> {
  const access = dealAccess(role)
  const withCrm = access.pipelines.includes('crm')
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
  return { deals, team }
}
