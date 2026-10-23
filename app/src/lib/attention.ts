import { assistCostInMonth, type AiUsageRow } from './aiAssist'
import { isCancelledInvoice } from './finance'
import { calculateOverage, monthKey, profitability, VAT_RATE, type DeliveryRates } from './delivery'
import type { Contract, DeliveryPackage, Invoice, TimeEntry, UsageRecord } from './types'

/**
 * This month's client and church revenue against the cost estimate, for the
 * dashboard. Revenue excludes VAT. AI CRM revenue is each running contract's
 * fee plus overage; church revenue is invoices dated this month that are
 * linked to a WorshipHub church account. Variable cost is tools and hours at
 * the internal rate; fixed cost is the estimate on Packages and rates.
 */
export type MonthCosts = {
  month: string
  aiCrmRevenueAed: number
  churchRevenueAed: number
  revenueAed: number
  toolCostAed: number
  labourAed: number
  fixedCostAed: number
  leftAed: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function monthCosts(input: {
  now: Date
  contracts: Contract[]
  packages: DeliveryPackage[]
  usage: UsageRecord[]
  entries: Pick<TimeEntry, 'account_id' | 'date' | 'hours'>[]
  invoices: Pick<Invoice, 'account_id' | 'date' | 'amount' | 'status'>[]
  churchAccountIds: Set<string>
  rates: DeliveryRates
  /** RR Central AI help logged this month (ai_usage_log). */
  assist?: AiUsageRow[]
}): MonthCosts {
  const month = monthKey(input.now)
  let aiCrmRevenueAed = 0
  let toolCostAed = 0
  let labourAed = 0
  const running = input.contracts.filter(
    (c) =>
      c.status === 'active' &&
      (!c.term_start || monthKey(c.term_start) <= month) &&
      (!c.term_end || monthKey(c.term_end) >= month),
  )
  for (const c of running) {
    const pkg = input.packages.find((p) => p.id === c.package_id) ?? null
    const usage = input.usage.find((u) => u.account_id === c.account_id && monthKey(u.month) === month) ?? null
    const hours = input.entries
      .filter((e) => e.account_id === c.account_id && monthKey(e.date) === month)
      .reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
    const p = profitability({
      contract: c,
      pkg,
      usage,
      overageAed: pkg && usage ? calculateOverage(usage, pkg, input.rates).totalAed : 0,
      hours,
      rates: input.rates,
      assistUsd: assistCostInMonth(input.assist ?? [], c.account_id, month),
    })
    aiCrmRevenueAed += p.revenueAed
    toolCostAed += p.toolCostAed
    labourAed += p.labourAed
  }
  // Hours on accounts without a running contract still cost time.
  const contracted = new Set(running.map((c) => c.account_id))
  labourAed += input.entries
    .filter((e) => !contracted.has(e.account_id) && monthKey(e.date) === month)
    .reduce((sum, e) => sum + (Number(e.hours) || 0) * input.rates.internalHourlyRateAed, 0)

  const churchRevenueAed = input.invoices
    .filter(
      (i) =>
        i.account_id &&
        input.churchAccountIds.has(i.account_id) &&
        i.date &&
        monthKey(i.date) === month &&
        !isCancelledInvoice(i),
    )
    .reduce((sum, i) => sum + (Number(i.amount) || 0) / (1 + VAT_RATE), 0)

  const revenueAed = aiCrmRevenueAed + churchRevenueAed
  const fixedCostAed = input.rates.fixedMonthlyCostAed
  return {
    month,
    aiCrmRevenueAed: round2(aiCrmRevenueAed),
    churchRevenueAed: round2(churchRevenueAed),
    revenueAed: round2(revenueAed),
    toolCostAed: round2(toolCostAed),
    labourAed: round2(labourAed),
    fixedCostAed: round2(fixedCostAed),
    leftAed: round2(revenueAed - toolCostAed - labourAed - fixedCostAed),
  }
}
