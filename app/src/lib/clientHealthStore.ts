import { db } from './db'
import { isMissingRelationError } from './errors'
import { listAccounts } from './accountsStore'
import { currentContract, monthKey } from './delivery'
import { listContracts, listPackages, listUsage } from './deliveryStore'
import { paidByReference } from './contractBillingStore'
import { listTickets } from './supportStore'
import { clientHealth, type ClientHealth, type HealthInput } from './clientHealth'
import type { Account, Contract, DeliveryPackage, Invoice, ReportCall } from './types'

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

export async function listReportCalls(accountId?: string): Promise<ReportCall[]> {
  let q = db.from('report_calls').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  return rows<ReportCall>(q.order('month', { ascending: false }))
}

/** One row per client per month: change it if it exists, else add it. */
export async function saveReportCall(
  accountId: string,
  month: string,
  status: ReportCall['status'],
  author: string,
  existing: ReportCall[],
): Promise<void> {
  const key = monthKey(month)
  const now = new Date().toISOString()
  const found = existing.find((c) => c.account_id === accountId && monthKey(c.month) === key)
  const { error } = found
    ? await db.from('report_calls').update({ status, updated_at: now }).eq('id', found.id)
    : await db.from('report_calls').insert({
        id: crypto.randomUUID(),
        account_id: accountId,
        month: key,
        status,
        notes: '',
        created_by: author,
        created_at: now,
        updated_at: now,
      })
  if (error) throw error
}

export async function clearReportCall(id: string): Promise<void> {
  const { error } = await db.from('report_calls').delete().eq('id', id)
  if (error) throw error
}

/** Invoices linked to clients, with what is still owed on each. */
async function invoicesWithBalance(accountId?: string): Promise<{ accountId: string; invoice: Invoice; balance: number }[]> {
  let q = db.from('invoices').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  const [invoices, paid] = await Promise.all([rows<Invoice>(q), paidByReference()])
  return invoices
    .filter((i) => i.account_id)
    .map((invoice) => ({
      accountId: String(invoice.account_id),
      invoice,
      balance: Math.max(0, Math.round((Number(invoice.amount) - (paid.get(invoice.reference_number) ?? 0)) * 100) / 100),
    }))
}

export type HealthRow = {
  account: Account
  contract: Contract | null
  pkg: DeliveryPackage | null
  health: ClientHealth
}

/** Health for one client, or every AI CRM client with a running contract. */
export async function loadClientHealth(accountId?: string, today: Date = new Date()): Promise<HealthRow[]> {
  const [accounts, contracts, packages, usage, tickets, calls, invoices] = await Promise.all([
    listAccounts().then((r) => r.rows),
    listContracts(accountId),
    listPackages(),
    listUsage(accountId),
    listTickets(accountId),
    listReportCalls(accountId),
    invoicesWithBalance(accountId),
  ])
  const out: HealthRow[] = []
  for (const account of accounts) {
    if (accountId ? account.id !== accountId : account.type !== 'ai_crm_client') continue
    const contract = currentContract(contracts.filter((c) => c.account_id === account.id))
    if (!accountId && contract?.status !== 'active') continue
    const pkg = packages.find((p) => p.id === contract?.package_id) ?? null
    const input: HealthInput = {
      contract,
      pkg,
      usage: usage.filter((u) => u.account_id === account.id),
      tickets: tickets.filter((t) => t.account_id === account.id),
      calls: calls.filter((c) => c.account_id === account.id),
      invoices: invoices.filter((i) => i.accountId === account.id),
      today,
    }
    out.push({ account, contract, pkg, health: clientHealth(input) })
  }
  return out.sort((a, b) => a.health.score - b.health.score || a.account.name.localeCompare(b.account.name))
}
