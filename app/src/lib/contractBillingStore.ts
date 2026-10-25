import { format } from 'date-fns'
import { db } from './db'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { DIVISIONS } from './config'
import { errorCode, isMissingRelationError, isUndefinedColumnError } from './errors'
import { logAccountEvent } from './accountsStore'
import {
  AUTO_INVOICE_NOTE,
  CONTRACT_INVOICE_DIVISION_KEY,
  CONTRACT_INVOICE_TERMS_KEY,
  DEFAULT_CONTRACT_INVOICE_DIVISION,
  DEFAULT_CONTRACT_INVOICE_TERMS,
  dueReminder,
  isCollectible,
  monthlyInvoicePlan,
  setupInvoicePlan,
  withVat,
  type DueReminder,
  type PlannedInvoice,
} from './contractBilling'
import { monthKey, VAT_RATE, type DeliveryRates } from './delivery'
import { saveLineItems, newDraftLine } from './lineItems'
import type {
  Account,
  Contract,
  ContractInvoice,
  DeliveryPackage,
  Invoice,
  InvoiceReminder,
  PaymentLogEntry,
  UsageRecord,
} from './types'

type Author = { appUserId: string | null; email: string }

/** True when the billing migration has not been run yet. */
function notReady(error: unknown): boolean {
  return isMissingRelationError(error) || isUndefinedColumnError(error)
}

export async function listContractInvoices(accountId?: string): Promise<ContractInvoice[]> {
  let q = db.from('contract_invoices').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) {
    if (notReady(error)) return []
    throw error
  }
  return (data || []) as ContractInvoice[]
}

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

type BillingSettings = ReturnType<typeof billingSettings>

function draftLines(plan: PlannedInvoice) {
  return plan.lines.map((l) => newDraftLine({ description: l.description, qty: l.qty, unit_price: l.unit_price }))
}

async function raiseInvoice(
  contract: Contract,
  account: Pick<Account, 'id' | 'name'>,
  plan: PlannedInvoice,
  cfg: BillingSettings,
  author: Author,
): Promise<boolean> {
  const total = withVat(plan.subtotal, cfg.vatRate)
  // Claim the month first: the unique key stops a second browser raising it too.
  const claimId = crypto.randomUUID()
  const claim = await db.from('contract_invoices').insert({
    id: claimId,
    contract_id: contract.id,
    account_id: account.id,
    kind: plan.kind,
    period: plan.period,
    invoice_id: null,
    generated_amount: total,
    discount_applied: plan.usesDiscountMonth,
    created_at: new Date().toISOString(),
  })
  if (claim.error) {
    if (errorCode(claim.error) === '23505' || /duplicate key/i.test(String((claim.error as { message?: string }).message))) {
      return false
    }
    throw claim.error
  }

  const reference = `INV-DRAFT-${Date.now()}-${claimId.slice(0, 4)}`
  const invoiceId = crypto.randomUUID()
  const now = new Date().toISOString()
  const { error } = await db.from('invoices').insert({
    id: invoiceId,
    account_id: account.id,
    client: account.name,
    vertical: cfg.vertical,
    reference_number: reference,
    date: format(new Date(), 'yyyy-MM-dd'),
    description: plan.description,
    amount: total,
    status: 'Draft',
    payment_status: 'Pending',
    payment_terms: cfg.paymentTerms,
    moq: '',
    notes: AUTO_INVOICE_NOTE,
    delivery_terms: '',
    created_by: author.email,
    updated_by: author.email,
    created_at: now,
    updated_at: now,
  })
  if (error) {
    // Free the month again so the next run can retry.
    await db.from('contract_invoices').delete().eq('id', claimId)
    throw error
  }
  await saveLineItems('Invoice', reference, draftLines(plan), cfg.vatRate)
  await db.from('contract_invoices').update({ invoice_id: invoiceId }).eq('id', claimId)
  if (plan.usesDiscountMonth) {
    await db
      .from('contracts')
      .update({
        discount_months_left: Math.max(0, Number(contract.discount_months_left) - 1),
        updated_at: now,
      })
      .eq('id', contract.id)
  }
  await logAccountEvent(
    account.id,
    `Draft invoice raised: ${plan.description}, ${total.toFixed(2)} AED incl. VAT`,
    author,
  )
  return true
}

/**
 * Keep this month's unsent draft in step with usage entered after it was
 * raised. Only touches drafts nobody has edited (the total still matches).
 */
async function refreshDraft(
  row: ContractInvoice,
  invoice: Invoice,
  plan: PlannedInvoice | null,
  cfg: BillingSettings,
  author: Author,
): Promise<boolean> {
  if (!plan || String(invoice.status).toLowerCase() !== 'draft') return false
  if (Math.abs(Number(invoice.amount) - Number(row.generated_amount)) > 0.009) return false
  const total = withVat(plan.subtotal, cfg.vatRate)
  if (Math.abs(total - Number(row.generated_amount)) <= 0.009) return false
  await saveLineItems('Invoice', invoice.reference_number, draftLines(plan), cfg.vatRate)
  await db
    .from('invoices')
    .update({ amount: total, description: plan.description, updated_by: author.email, updated_at: new Date().toISOString() })
    .eq('id', invoice.id)
  await db.from('contract_invoices').update({ generated_amount: total }).eq('id', row.id)
  return true
}

/**
 * Mark the setup fee as handled outside automatic invoicing, so switching it
 * on for a contract that is already running never raises a second setup invoice.
 */
export async function skipSetupInvoice(contract: Pick<Contract, 'id' | 'account_id' | 'term_start' | 'created_at'>): Promise<void> {
  const { error } = await db.from('contract_invoices').insert({
    id: crypto.randomUUID(),
    contract_id: contract.id,
    account_id: contract.account_id,
    kind: 'setup',
    period: monthKey(contract.term_start || contract.created_at || new Date()),
    invoice_id: null,
    generated_amount: 0,
    discount_applied: false,
    created_at: new Date().toISOString(),
  })
  if (error && errorCode(error) !== '23505' && !notReady(error)) throw error
}

export type BillingRunResult = { raised: number; refreshed: number; ready: boolean }

/**
 * Raise any setup or monthly invoice that is due, as drafts, for contracts
 * with automatic invoicing on. Safe to run often: each contract month is
 * raised once. Pass `contractId` to run for one contract only.
 */
type RunInput = {
  rates: DeliveryRates
  settings: Record<string, string | undefined>
  author: Author
  today?: Date
  contractId?: string
}

let running: Promise<BillingRunResult> | null = null

export async function runContractBilling(input: RunInput): Promise<BillingRunResult> {
  // One run at a time in this browser (local mode has no unique keys to lean on).
  while (running) await running.catch(() => undefined)
  running = billingRun(input)
  try {
    return await running
  } finally {
    running = null
  }
}

async function billingRun(input: RunInput): Promise<BillingRunResult> {
  const today = input.today ?? new Date()
  const cfg = billingSettings(input.settings)
  let cq = db.from('contracts').select('*').eq('auto_invoice', true)
  if (input.contractId) cq = cq.eq('id', input.contractId)
  const { data: cData, error: cErr } = await cq
  if (cErr) {
    if (notReady(cErr)) return { raised: 0, refreshed: 0, ready: false }
    throw cErr
  }
  const contracts = ((cData || []) as Contract[]).filter((c) => c.auto_invoice)
  if (contracts.length === 0) return { raised: 0, refreshed: 0, ready: true }

  const accountIds = [...new Set(contracts.map((c) => c.account_id))]
  const [pRes, aRes, uRes, existing] = await Promise.all([
    db.from('delivery_packages').select('*'),
    db.from('accounts').select('id, name').in('id', accountIds),
    db.from('usage_records').select('*').in('account_id', accountIds),
    listContractInvoices(),
  ])
  if (pRes.error) throw pRes.error
  if (aRes.error) throw aRes.error
  if (uRes.error && !isMissingRelationError(uRes.error)) throw uRes.error
  const packages = (pRes.data || []) as DeliveryPackage[]
  const accounts = (aRes.data || []) as Pick<Account, 'id' | 'name'>[]
  const usage = (uRes.data || []) as UsageRecord[]

  const month = monthKey(today)
  const prevMonth = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1))
  let raised = 0
  let refreshed = 0

  for (const contract of contracts) {
    const account = accounts.find((a) => a.id === contract.account_id)
    if (!account) continue
    const pkg = packages.find((p) => p.id === contract.package_id) ?? null
    const previousUsage =
      usage.find((u) => u.account_id === contract.account_id && monthKey(u.month) === prevMonth) ?? null
    const mine = existing.filter((r) => r.contract_id === contract.id)

    const setup = setupInvoicePlan(contract, pkg?.name ?? 'AI CRM')
    if (setup && !mine.some((r) => r.kind === 'setup')) {
      if (await raiseInvoice(contract, account, setup, cfg, input.author)) raised++
    }

    const row = mine.find((r) => r.kind === 'monthly' && monthKey(r.period) === month)
    if (!row) {
      const monthly = monthlyInvoicePlan({ contract, pkg, previousUsage, rates: input.rates, month })
      if (monthly && (await raiseInvoice(contract, account, monthly, cfg, input.author))) raised++
    } else if (row.invoice_id) {
      const { data: inv } = await db.from('invoices').select('*').eq('id', row.invoice_id).maybeSingle()
      if (!inv) continue
      // The discount month was already used by this invoice, so price it as it was.
      const asRaised = row.discount_applied
        ? { ...contract, discount_months_left: Number(contract.discount_months_left) + 1 }
        : { ...contract, discount_months_left: 0 }
      const plan = monthlyInvoicePlan({ contract: asRaised, pkg, previousUsage, rates: input.rates, month })
      if (await refreshDraft(row, inv as Invoice, plan, cfg, input.author)) refreshed++
    }
  }
  return { raised, refreshed, ready: true }
}

// ---------------------------------------------------------------------------
// Payment reminders
// ---------------------------------------------------------------------------

export async function listReminders(): Promise<InvoiceReminder[]> {
  const { data, error } = await db.from('invoice_reminders').select('*')
  if (error) {
    if (notReady(error)) return []
    throw error
  }
  return (data || []) as InvoiceReminder[]
}

export async function recordReminder(
  invoiceId: string,
  stage: number,
  channel: InvoiceReminder['channel'],
  sentBy: string,
): Promise<void> {
  const { error } = await db.from('invoice_reminders').insert({
    id: crypto.randomUUID(),
    invoice_id: invoiceId,
    stage,
    channel,
    sent_by: sentBy,
    sent_at: new Date().toISOString(),
  })
  // Someone else already recorded it: nothing more to do.
  if (error && errorCode(error) !== '23505') throw error
}

/** Money still owed per invoice reference, from the payment log. */
export async function paidByReference(): Promise<Map<string, number>> {
  const { data, error } = await db.from('payment_log').select('invoice_ref, amount')
  if (error) {
    if (isMissingRelationError(error)) return new Map()
    throw error
  }
  const out = new Map<string, number>()
  for (const p of (data || []) as Pick<PaymentLogEntry, 'invoice_ref' | 'amount'>[]) {
    out.set(p.invoice_ref, (out.get(p.invoice_ref) ?? 0) + (Number(p.amount) || 0))
  }
  return out
}

export type ReminderRow = { invoice: Invoice; balance: number; due: DueReminder }

/** Invoices with a 3, 7 or 14 day reminder due now, most overdue first. */
export async function listDueReminders(today: Date = new Date()): Promise<ReminderRow[]> {
  const [{ data, error }, paid, sent] = await Promise.all([
    db.from('invoices').select('*'),
    paidByReference(),
    listReminders(),
  ])
  if (error) throw error
  const out: ReminderRow[] = []
  for (const inv of (data || []) as Invoice[]) {
    if (!isCollectible(inv)) continue
    const balance = Math.max(0, Math.round((Number(inv.amount) - (paid.get(inv.reference_number) ?? 0)) * 100) / 100)
    const stages = sent.filter((r) => r.invoice_id === inv.id).map((r) => r.stage)
    const due = dueReminder(inv, balance, stages, today)
    if (due) out.push({ invoice: inv, balance, due })
  }
  return out.sort((a, b) => b.due.daysLate - a.due.daysLate)
}

export type SendReminderResult =
  | { ok: true; to: string; stage: number }
  | { ok: false; code: string; message: string }

/**
 * One tap: the payment-reminder function sends the due reminder by email or
 * WhatsApp and records it (once per stage). `code` tells the card when to
 * fall back to the old way: not_deployed, email_not_configured,
 * whatsapp_not_configured, no_recipient, already_sent, not_due, send_failed.
 */
export async function sendReminder(invoiceId: string, channel: 'email' | 'whatsapp', contactId?: string): Promise<SendReminderResult> {
  if (!isSupabaseConfigured()) return { ok: false, code: 'not_deployed', message: 'Local mode cannot send reminders.' }
  const { data, error } = await getSupabaseClient().functions.invoke('payment-reminder', {
    body: { invoice_id: invoiceId, channel, contact_id: contactId },
  })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || /Failed to send a request/i.test(String((error as Error).message))) {
      return { ok: false, code: 'not_deployed', message: 'The payment-reminder function is not deployed yet.' }
    }
    try {
      const body = await (error as { context?: Response }).context?.json()
      return { ok: false, code: String(body?.code || 'error'), message: String(body?.error || 'The reminder was not sent.') }
    } catch {
      return { ok: false, code: 'error', message: 'The reminder was not sent.' }
    }
  }
  const d = data as { to: string; stage: number }
  return { ok: true, to: d.to, stage: d.stage }
}
