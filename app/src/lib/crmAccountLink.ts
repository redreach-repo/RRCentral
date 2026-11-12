import { sameCompany } from './accounts'
import { createAccount, getAccount, listAccounts, logAccountEvent, saveContact } from './accountsStore'
import { hydrateContacts, primaryContact } from './contacts'
import { db } from './db'
import type { Account, CrmEntry } from './types'

export type CrmAccountLink =
  | { status: 'linked'; account: Account }
  | { status: 'ambiguous'; accounts: Account[] }
  | { status: 'none' }

/** Soft-match CRM company name to Accounts (same normaliser as SQL linking). */
export function resolveCrmAccountLink(companyName: string, accounts: Account[]): CrmAccountLink {
  const name = companyName.trim()
  if (!name) return { status: 'none' }
  const matches = accounts.filter((a) => sameCompany(a.name, name))
  if (matches.length === 1) return { status: 'linked', account: matches[0] }
  if (matches.length > 1) return { status: 'ambiguous', accounts: matches }
  return { status: 'none' }
}

/** Prefer the FK when set; fall back to soft name match. */
export async function findAccountForCrm(
  entryOrName: Pick<CrmEntry, 'company_name' | 'account_id'> | string,
): Promise<CrmAccountLink> {
  const accountId = typeof entryOrName === 'string' ? null : entryOrName.account_id || null
  const companyName = typeof entryOrName === 'string' ? entryOrName : entryOrName.company_name

  if (accountId) {
    try {
      const account = await getAccount(accountId)
      if (account) return { status: 'linked', account }
    } catch {
      // Fall through to name match if the FK is stale.
    }
  }

  const { rows, missingTable } = await listAccounts()
  if (missingTable) return { status: 'none' }
  return resolveCrmAccountLink(companyName, rows)
}

/** Persist crm.account_id (best-effort if the column is not migrated yet). */
export async function linkCrmToAccount(crmId: string, accountId: string): Promise<void> {
  const { error } = await db.from('crm').update({ account_id: accountId }).eq('id', crmId)
  if (error) {
    const msg = String((error as { message?: string }).message || error)
    if (/account_id|column/i.test(msg)) return
    throw error
  }
}

export type CreateAccountFromCrmOpts = {
  createdBy: string
  ownerUserId: string | null
  knownRefs?: string[]
  /** Default ai_crm_client — general CRM companies land as prospects there. */
  type?: Account['type']
}

/**
 * Create the Accounts org of record for a CRM company (and seed primary contact),
 * then write crm.account_id when the column exists.
 */
export async function createAccountFromCrm(
  entry: CrmEntry,
  opts: CreateAccountFromCrmOpts,
): Promise<Account> {
  const name = (entry.company_name || '').trim()
  if (!name) throw new Error('Company name is required')

  if (entry.account_id) {
    const existing = await getAccount(entry.account_id)
    if (existing) return existing
  }

  const { rows } = await listAccounts()
  const existing = resolveCrmAccountLink(name, rows)
  if (existing.status === 'linked') {
    await linkCrmToAccount(entry.id, existing.account.id)
    return existing.account
  }
  if (existing.status === 'ambiguous') {
    throw new Error('Several accounts match this company — open one from Clients → Accounts')
  }

  const contacts = hydrateContacts(entry)
  const primary = primaryContact(contacts)
  const notes = [
    entry.notes?.trim() || '',
    entry.company_owner?.trim() ? `Business owner: ${entry.company_owner.trim()}` : '',
    entry.trn?.trim() ? `TRN: ${entry.trn.trim()}` : '',
    entry.address?.trim() ? `Address: ${entry.address.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const account = await createAccount(
    {
      type: opts.type || 'ai_crm_client',
      name,
      industry: '',
      country: '',
      city: '',
      website: entry.website || '',
      status: 'prospect',
      owner_user_id: opts.ownerUserId,
      source: 'crm',
      notes,
    },
    opts.createdBy,
    opts.knownRefs || rows.map((r) => r.reference),
  )

  const seedName = primary?.name?.trim() || entry.primary_contact?.trim() || ''
  if (seedName) {
    await saveContact(account.id, {
      name: seedName,
      role: primary?.role || 'Primary',
      email: primary?.email || '',
      phone: primary?.phone || entry.mobile_number || '',
      whatsapp: primary?.phone || entry.mobile_number || '',
      is_primary: true,
    })
  }

  await logAccountEvent(
    account.id,
    `Created from CRM (${entry.pipeline_stage || 'Lead'}) by ${opts.createdBy}`,
    { appUserId: opts.ownerUserId, email: opts.createdBy },
  )

  await linkCrmToAccount(entry.id, account.id)
  return account
}

/** Find the CRM row linked to an account (FK first, then name). */
export async function findCrmForAccount(account: Pick<Account, 'id' | 'name'>): Promise<CrmEntry | null> {
  const byFk = await db.from('crm').select('*').eq('account_id', account.id).limit(1)
  if (!byFk.error && byFk.data?.length) return byFk.data[0] as CrmEntry

  const { data, error } = await db.from('crm').select('*').ilike('company_name', account.name).limit(10)
  if (error || !data?.length) return null
  const rows = data as CrmEntry[]
  const exact = rows.find((r) => sameCompany(r.company_name, account.name))
  return exact || null
}
