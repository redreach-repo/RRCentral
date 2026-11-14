import type { CrmLinkPlan } from './crmAccountLink'
import type { NoNextStepRow } from './dealRules'
import type { DealRow } from './myDeals'

/**
 * M3 phase 1 inventory metrics for Pipeline unify — counts only, no writes.
 */

export type CrmAccountCoverage = {
  /** CRM rows examined. */
  total: number
  /** Already have account_id. */
  linked: number
  /** Unlinked with exactly one soft Account match. */
  uniqueMatch: number
  /** Unlinked matching more than one Account. */
  ambiguous: number
  /** Unlinked with no Account match. */
  none: number
  /** Share of CRM rows already linked (0–1). */
  linkedShare: number
}

export type OpenDealInvariantSummary = {
  openDeals: number
  missingNextStep: number
  /** Share of open deals that already satisfy next-action + date (0–1). */
  healthyShare: number
}

/** Coverage of CRM → Accounts links from a backfill plan + linked count. */
export function crmAccountCoverage(
  linkedCount: number,
  plan: Pick<CrmLinkPlan, 'unique' | 'ambiguous' | 'none'>,
): CrmAccountCoverage {
  const uniqueMatch = plan.unique.length
  const ambiguous = plan.ambiguous.length
  const none = plan.none.length
  const total = linkedCount + uniqueMatch + ambiguous + none
  return {
    total,
    linked: linkedCount,
    uniqueMatch,
    ambiguous,
    none,
    linkedShare: total === 0 ? 1 : linkedCount / total,
  }
}

/** Open-deal next-action invariant summary from Pipeline rows + noNextStep gaps. */
export function openDealInvariantSummary(
  deals: Pick<DealRow, 'open'>[],
  gaps: Pick<NoNextStepRow, 'key'>[],
): OpenDealInvariantSummary {
  const openDeals = deals.filter((d) => d.open).length
  const missingNextStep = gaps.length
  const healthy = Math.max(0, openDeals - missingNextStep)
  return {
    openDeals,
    missingNextStep,
    healthyShare: openDeals === 0 ? 1 : healthy / openDeals,
  }
}

/** One-line status for ops / STATUS.md style digests. */
export function formatInventoryDigest(coverage: CrmAccountCoverage, invariants: OpenDealInvariantSummary): string {
  const linkedPct = Math.round(coverage.linkedShare * 100)
  const healthyPct = Math.round(invariants.healthyShare * 100)
  return `CRM linked ${coverage.linked}/${coverage.total} (${linkedPct}%); open deals healthy ${healthyPct}% (${invariants.openDeals - invariants.missingNextStep}/${invariants.openDeals})`
}
