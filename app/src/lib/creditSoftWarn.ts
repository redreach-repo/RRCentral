/** Soft credit warn for quote/invoice save paths (never hard-blocks). */

import { sameCompany } from './accounts'
import { listAccounts } from './accountsStore'
import {
  creditSnapshotFromAccount,
  creditWarnMessage,
  openArFromInvoices,
} from './creditLimits'
import { db } from './db'

export async function resolveCreditWarnForClient(
  clientName: string,
  additionalAed = 0,
): Promise<string | null> {
  const name = clientName.trim()
  if (!name) return null
  const { rows } = await listAccounts().catch(() => ({ rows: [] as Awaited<ReturnType<typeof listAccounts>>['rows'] }))
  const account = rows.find((a) => sameCompany(a.name, name))
  if (!account) return null

  const { data } = await db
    .from('invoices')
    .select('amount, payment_status, status, client, account_id')
    .limit(500)
  const related = ((data || []) as {
    amount?: number
    payment_status?: string
    status?: string
    client?: string
    account_id?: string | null
  }[]).filter(
    (inv) =>
      inv.account_id === account.id || (!inv.account_id && sameCompany(String(inv.client || ''), name)),
  )
  return creditWarnMessage(creditSnapshotFromAccount(account, openArFromInvoices(related)), additionalAed)
}
