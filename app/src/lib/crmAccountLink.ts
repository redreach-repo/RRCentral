import { sameCompany } from './accounts'
import { createAccount, listAccounts, logAccountEvent, saveContact } from './accountsStore'
import { hydrateContacts, primaryContact } from './contacts'
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

export async function findAccountForCrm(companyName: string): Promise<CrmAccountLink> {
  const { rows, missingTable } = await listAccounts()
  if (missingTable) return { status: 'none' }
  return resolveCrmAccountLink(companyName, rows)
}

export type CreateAccountFromCrmOpts = {
  createdBy: string
  ownerUserId: string | null
  knownRefs?: string[]
  /** Default ai_crm_client — general CRM companies land as prospects there. */
  type?: Account['type']
}

/**
 * Create the Accounts org of record for a CRM company (and seed primary contact).
 * Does not write an FK on crm — soft name match is enough until a later migration.
 */
export async function createAccountFromCrm(
  entry: CrmEntry,
  opts: CreateAccountFromCrmOpts,
): Promise<Account> {
  const name = (entry.company_name || '').trim()
  if (!name) throw new Error('Company name is required')

  const { rows } = await listAccounts()
  const existing = resolveCrmAccountLink(name, rows)
  if (existing.status === 'linked') return existing.account
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

  return account
}
