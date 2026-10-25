import { db } from './db'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { errorCode, isMissingRelationError, isUndefinedColumnError } from './errors'
import { logAccountEvent } from './accountsStore'
import { dueReminder, isCollectible, type DueReminder } from './contractBilling'
import { billingSettings, runBilling, type BillingDb, type BillingRunResult } from './contractBillingRun'
import { monthKey, type DeliveryRates } from './delivery'
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

export { billingSettings }

/** The browser's database calls for a billing run (contractBillingRun.ts). */
function browserBillingDb(author: Author): BillingDb {
  return {
    newId: () => crypto.randomUUID(),
    async claim(row) {
      const { error } = await db.from('contract_invoices').insert(row)
      if (!error) return true
      if (errorCode(error) === '23505' || /duplicate key/i.test(String((error as { message?: string }).message))) return false
      throw error
    },
    async releaseClaim(id) {
      await db.from('contract_invoices').delete().eq('id', id)
    },
    async insertInvoice(row) {
      const { error } = await db.from('invoices').insert(row)
      if (error) throw error
    },
    async replaceLines(reference, rows) {
      const { error: deleteError } = await db.from('line_items').delete().eq('doc_type', 'Invoice').eq('reference', reference)
      if (deleteError) throw deleteError
      if (!rows.length) return
      const { error } = await db.from('line_items').insert(rows)
      if (error) throw error
    },
    async linkClaim(claimId, invoiceId) {
      await db.from('contract_invoices').update({ invoice_id: invoiceId }).eq('id', claimId)
    },
    async setClaimAmount(claimId, amount) {
      await db.from('contract_invoices').update({ generated_amount: amount }).eq('id', claimId)
    },
    async setDiscountMonthsLeft(contractId, left) {
      await db.from('contracts').update({ discount_months_left: left, updated_at: new Date().toISOString() }).eq('id', contractId)
    },
    async getInvoice(id) {
      const { data } = await db.from('invoices').select('*').eq('id', id).maybeSingle()
      return (data as Invoice | null) ?? null
    },
    async updateInvoice(id, fields) {
      await db.from('invoices').update(fields).eq('id', id)
    },
    logEvent: (accountId, body) => logAccountEvent(accountId, body, author),
  }
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

export type { BillingRunResult }

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
  let cq = db.from('contracts').select('*').eq('auto_invoice', true)
  if (input.contractId) cq = cq.eq('id', input.contractId)
  const { data: cData, error: cErr } = await cq
  if (cErr) {
    if (notReady(cErr)) return { raised: 0, refreshed: 0, ready: false, drafted: [] }
    throw cErr
  }
  const contracts = ((cData || []) as Contract[]).filter((c) => c.auto_invoice)
  if (contracts.length === 0) return { raised: 0, refreshed: 0, ready: true, drafted: [] }

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

  return runBilling({
    data: {
      contracts,
      packages: (pRes.data || []) as DeliveryPackage[],
      accounts: (aRes.data || []) as Pick<Account, 'id' | 'name'>[],
      usage: (uRes.data || []) as UsageRecord[],
      existing,
    },
    dbx: browserBillingDb(input.author),
    cfg: billingSettings(input.settings),
    rates: input.rates,
    authorEmail: input.author.email,
    today: input.today ?? new Date(),
  })
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
