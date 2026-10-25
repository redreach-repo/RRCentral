import { format } from 'date-fns'
import { DIVISIONS } from './config'
import {
  AUTO_INVOICE_NOTE,
  CONTRACT_INVOICE_DIVISION_KEY,
  CONTRACT_INVOICE_TERMS_KEY,
  DEFAULT_CONTRACT_INVOICE_DIVISION,
  DEFAULT_CONTRACT_INVOICE_TERMS,
  monthlyInvoicePlan,
  setupInvoicePlan,
  withVat,
  type PlannedInvoice,
} from './contractBilling'
import { monthKey, VAT_RATE, type DeliveryRates } from './delivery'
import type { Account, Contract, ContractInvoice, DeliveryPackage, Invoice, UsageRecord } from './types'

/**
 * One contract billing run: raise the setup and monthly invoices that are
 * due as drafts, and keep this month's untouched drafts in step with usage.
 *
 * Shared by the browser (contractBillingStore.ts) and the daily
 * contract-invoices Edge Function (bundled by
 * app/scripts/build-support-function.mjs), so both follow the same rules.
 * The database is passed in as `BillingDb`; only pure modules are imported.
 *
 * Each contract, kind and month is raised once: the claim row in
 * contract_invoices has a unique key (contract_id, kind, period), so a second
 * run, or the app and the schedule at the same time, raise nothing more.
 */

// For the Edge Function bundle, which reads the rates from app_settings too.
export { ratesFromSettings } from './delivery'

/** Set by the daily schedule after each run; the app only raises invoices itself when this is old. */
export const BILLING_LAST_RUN_KEY = 'contractBillingLastRun'
/** How long the app waits for the schedule before it raises invoices itself. */
export const SCHEDULE_GRACE_HOURS = 36

export function billingSettings(settings: Record<string, string | undefined>) {
  const code = settings[CONTRACT_INVOICE_DIVISION_KEY] || DEFAULT_CONTRACT_INVOICE_DIVISION
  const division = DIVISIONS.find((d) => d.code === code) ?? DIVISIONS.find((d) => d.code === DEFAULT_CONTRACT_INVOICE_DIVISION)!
  const vatRate = Number(settings.vatRate)
  return {
    vertical: division.brand,
    paymentTerms: settings[CONTRACT_INVOICE_TERMS_KEY] || DEFAULT_CONTRACT_INVOICE_TERMS,
    vatRate: Number.isFinite(vatRate) && vatRate >= 0 && vatRate < 1 ? vatRate : VAT_RATE,
  }
}

export type BillingSettings = ReturnType<typeof billingSettings>

/** True when the schedule ran recently enough that the app should leave billing to it. */
export function scheduleIsRunning(lastRun: string | undefined | null, now: Date = new Date()): boolean {
  const t = lastRun ? Date.parse(lastRun) : NaN
  if (!Number.isFinite(t)) return false
  return now.getTime() - t < SCHEDULE_GRACE_HOURS * 60 * 60 * 1000
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type InvoiceLineRow = {
  doc_type: 'Invoice'
  reference: string
  line_no: number
  description: string
  qty: number
  unit_price: number
  unit_cost: number
  vat_rate: number
  amount: number
  vat_amount: number
  line_total: number
  remarks: string
  sku: string
  sizes_json: null
}

/** The line_items rows for a planned invoice (the same rows the invoice editor saves). */
export function invoiceLineRows(reference: string, plan: PlannedInvoice, vatRate: number): InvoiceLineRow[] {
  return plan.lines.map((l, idx) => {
    const qty = Number(l.qty) || 0
    const amount = round2(qty * (Number(l.unit_price) || 0))
    const vat_amount = round2(amount * vatRate)
    return {
      doc_type: 'Invoice',
      reference,
      line_no: idx + 1,
      description: l.description.trim(),
      qty,
      unit_price: Number(l.unit_price) || 0,
      unit_cost: 0,
      vat_rate: vatRate,
      amount,
      vat_amount,
      line_total: round2(amount + vat_amount),
      remarks: '',
      sku: '',
      sizes_json: null,
    }
  })
}

export type ClaimRow = Pick<
  ContractInvoice,
  'id' | 'contract_id' | 'account_id' | 'kind' | 'period' | 'invoice_id' | 'generated_amount' | 'discount_applied' | 'created_at'
>

/** The database calls a run needs. The app and the Edge Function each supply their own. */
export interface BillingDb {
  newId(): string
  /** Insert the claim row. False when that contract, kind and month is already claimed. */
  claim(row: ClaimRow): Promise<boolean>
  releaseClaim(id: string): Promise<void>
  insertInvoice(row: Record<string, unknown>): Promise<void>
  replaceLines(reference: string, rows: InvoiceLineRow[]): Promise<void>
  linkClaim(claimId: string, invoiceId: string): Promise<void>
  setClaimAmount(claimId: string, amount: number): Promise<void>
  setDiscountMonthsLeft(contractId: string, left: number): Promise<void>
  getInvoice(id: string): Promise<Invoice | null>
  updateInvoice(id: string, fields: Record<string, unknown>): Promise<void>
  /** A system line on the account timeline. Must not throw. */
  logEvent(accountId: string, body: string): Promise<void>
}

export type BillingData = {
  contracts: Contract[]
  packages: DeliveryPackage[]
  accounts: Pick<Account, 'id' | 'name'>[]
  usage: UsageRecord[]
  existing: ContractInvoice[]
}

export type DraftedInvoice = { accountId: string; accountName: string; description: string; total: number }
export type BillingRunResult = { raised: number; refreshed: number; ready: boolean; drafted: DraftedInvoice[] }

export type BillingRunInput = {
  data: BillingData
  dbx: BillingDb
  cfg: BillingSettings
  rates: DeliveryRates
  /** Email or name saved as created_by on the drafts. */
  authorEmail: string
  today: Date
}

async function raiseInvoice(
  dbx: BillingDb,
  contract: Contract,
  account: Pick<Account, 'id' | 'name'>,
  plan: PlannedInvoice,
  cfg: BillingSettings,
  authorEmail: string,
  today: Date,
): Promise<DraftedInvoice | null> {
  const total = withVat(plan.subtotal, cfg.vatRate)
  const now = new Date().toISOString()
  // Claim the month first: the unique key stops a second run raising it too.
  const claimId = dbx.newId()
  const claimed = await dbx.claim({
    id: claimId,
    contract_id: contract.id,
    account_id: account.id,
    kind: plan.kind,
    period: plan.period,
    invoice_id: null,
    generated_amount: total,
    discount_applied: plan.usesDiscountMonth,
    created_at: now,
  })
  if (!claimed) return null

  const reference = `INV-DRAFT-${Date.now()}-${claimId.slice(0, 4)}`
  const invoiceId = dbx.newId()
  try {
    await dbx.insertInvoice({
      id: invoiceId,
      account_id: account.id,
      client: account.name,
      vertical: cfg.vertical,
      reference_number: reference,
      date: format(today, 'yyyy-MM-dd'),
      description: plan.description,
      amount: total,
      status: 'Draft',
      payment_status: 'Pending',
      payment_terms: cfg.paymentTerms,
      moq: '',
      notes: AUTO_INVOICE_NOTE,
      delivery_terms: '',
      created_by: authorEmail,
      updated_by: authorEmail,
      created_at: now,
      updated_at: now,
    })
  } catch (e) {
    // Free the month again so the next run can retry.
    await dbx.releaseClaim(claimId)
    throw e
  }
  await dbx.replaceLines(reference, invoiceLineRows(reference, plan, cfg.vatRate))
  await dbx.linkClaim(claimId, invoiceId)
  if (plan.usesDiscountMonth) {
    await dbx.setDiscountMonthsLeft(contract.id, Math.max(0, Number(contract.discount_months_left) - 1))
  }
  await dbx.logEvent(account.id, `Draft invoice raised: ${plan.description}, ${total.toFixed(2)} AED incl. VAT`)
  return { accountId: account.id, accountName: account.name, description: plan.description, total }
}

/**
 * Keep this month's unsent draft in step with usage entered after it was
 * raised. Only touches drafts nobody has edited (the total still matches).
 */
async function refreshDraft(
  dbx: BillingDb,
  row: ContractInvoice,
  invoice: Invoice,
  plan: PlannedInvoice | null,
  cfg: BillingSettings,
  authorEmail: string,
): Promise<boolean> {
  if (!plan || String(invoice.status).toLowerCase() !== 'draft') return false
  if (Math.abs(Number(invoice.amount) - Number(row.generated_amount)) > 0.009) return false
  const total = withVat(plan.subtotal, cfg.vatRate)
  if (Math.abs(total - Number(row.generated_amount)) <= 0.009) return false
  await dbx.replaceLines(invoice.reference_number, invoiceLineRows(invoice.reference_number, plan, cfg.vatRate))
  await dbx.updateInvoice(invoice.id, {
    amount: total,
    description: plan.description,
    updated_by: authorEmail,
    updated_at: new Date().toISOString(),
  })
  await dbx.setClaimAmount(row.id, total)
  return true
}

export async function runBilling(input: BillingRunInput): Promise<BillingRunResult> {
  const { data, dbx, cfg, rates, authorEmail, today } = input
  const contracts = data.contracts.filter((c) => c.auto_invoice)
  const month = monthKey(today)
  const prevMonth = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1))
  const drafted: DraftedInvoice[] = []
  let refreshed = 0

  for (const contract of contracts) {
    const account = data.accounts.find((a) => a.id === contract.account_id)
    if (!account) continue
    const pkg = data.packages.find((p) => p.id === contract.package_id) ?? null
    const previousUsage =
      data.usage.find((u) => u.account_id === contract.account_id && monthKey(u.month) === prevMonth) ?? null
    const mine = data.existing.filter((r) => r.contract_id === contract.id)

    const setup = setupInvoicePlan(contract, pkg?.name ?? 'AI CRM')
    if (setup && !mine.some((r) => r.kind === 'setup')) {
      const done = await raiseInvoice(dbx, contract, account, setup, cfg, authorEmail, today)
      if (done) drafted.push(done)
    }

    const row = mine.find((r) => r.kind === 'monthly' && monthKey(r.period) === month)
    if (!row) {
      const monthly = monthlyInvoicePlan({ contract, pkg, previousUsage, rates, month })
      if (monthly) {
        const done = await raiseInvoice(dbx, contract, account, monthly, cfg, authorEmail, today)
        if (done) drafted.push(done)
      }
    } else if (row.invoice_id) {
      const inv = await dbx.getInvoice(row.invoice_id)
      if (!inv) continue
      // The discount month was already used by this invoice, so price it as it was.
      const asRaised = row.discount_applied
        ? { ...contract, discount_months_left: Number(contract.discount_months_left) + 1 }
        : { ...contract, discount_months_left: 0 }
      const plan = monthlyInvoicePlan({ contract: asRaised, pkg, previousUsage, rates, month })
      if (await refreshDraft(dbx, row, inv, plan, cfg, authorEmail)) refreshed++
    }
  }
  return { raised: drafted.length, refreshed, ready: true, drafted }
}
