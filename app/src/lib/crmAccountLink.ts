import { accountTypeFromDivision, sameCompany } from './accounts'
import {
  createAccount,
  getAccount,
  listAccounts,
  listContacts,
  logAccountEvent,
  saveContact,
} from './accountsStore'
import { flatFieldsFromContacts, hydrateContacts, normalizeContacts, primaryContact } from './contacts'
import { db } from './db'
import type { Account, AccountContact, AccountType, CrmContact, CrmEntry, Quotation } from './types'

function digits(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

/** Match key for syncing CRM contacts ↔ account_contacts (email, else phone, else name). */
export function contactMatchKey(c: { email?: string; phone?: string; name?: string }): string {
  const email = String(c.email || '')
    .trim()
    .toLowerCase()
  if (email) return `e:${email}`
  const phone = digits(String(c.phone || ''))
  if (phone.length >= 7) return `p:${phone}`
  const name = String(c.name || '')
    .trim()
    .toLowerCase()
  return name ? `n:${name}` : ''
}

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

export type CrmLinkProposal = {
  crmId: string
  companyName: string
  accountId: string
  accountName: string
  accountReference: string
}

export type CrmLinkPlan = {
  /** Unlinked CRM rows with exactly one soft-matched Account — safe to auto-link. */
  unique: CrmLinkProposal[]
  /** Unlinked CRM rows matching more than one Account — need a human. */
  ambiguous: { crmId: string; companyName: string; accountIds: string[] }[]
  /** Unlinked CRM rows with no Account match. */
  none: { crmId: string; companyName: string }[]
}

/**
 * M3 slice 2: plan FK backfill for CRM rows missing account_id.
 * Only unique soft-matches are proposed for bulk apply.
 */
export function planCrmAccountBackfill(
  crm: Pick<CrmEntry, 'id' | 'company_name' | 'account_id'>[],
  accounts: Account[],
): CrmLinkPlan {
  const unique: CrmLinkProposal[] = []
  const ambiguous: CrmLinkPlan['ambiguous'] = []
  const none: CrmLinkPlan['none'] = []

  for (const row of crm) {
    if (row.account_id) continue
    const companyName = String(row.company_name || '').trim()
    if (!companyName) continue
    const match = resolveCrmAccountLink(companyName, accounts)
    if (match.status === 'linked') {
      unique.push({
        crmId: row.id,
        companyName,
        accountId: match.account.id,
        accountName: match.account.name,
        accountReference: match.account.reference,
      })
    } else if (match.status === 'ambiguous') {
      ambiguous.push({
        crmId: row.id,
        companyName,
        accountIds: match.accounts.map((a) => a.id),
      })
    } else {
      none.push({ crmId: row.id, companyName })
    }
  }

  return { unique, ambiguous, none }
}

/** Persist unique soft-match proposals onto crm.account_id. Returns how many wrote. */
export async function applyUniqueCrmAccountLinks(proposals: CrmLinkProposal[]): Promise<number> {
  let linked = 0
  for (const p of proposals) {
    await linkCrmToAccount(p.crmId, p.accountId)
    linked += 1
  }
  return linked
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
  /**
   * Account type. When omitted, inferred from the company's latest quotation
   * division (e.g. 01 → RR Threads). Falls back to RR Threads — not AI CRM —
   * so uniform / trading companies are not mis-labelled.
   */
  type?: Account['type']
}

/** Prefer the latest quotation's division to pick Threads / Wanders / etc. */
export async function inferAccountTypeForCompany(companyName: string): Promise<AccountType> {
  const name = companyName.trim()
  if (!name) return 'rr_threads_client'
  const { data, error } = await db
    .from('quotations')
    .select('division_code, created_at, updated_at')
    .ilike('client', name)
    .order('updated_at', { ascending: false })
    .limit(20)
  if (error || !data?.length) return 'rr_threads_client'
  const rows = data as Pick<Quotation, 'division_code' | 'created_at' | 'updated_at'>[]
  for (const q of rows) {
    const typed = accountTypeFromDivision(q.division_code)
    if (typed) return typed
  }
  return 'rr_threads_client'
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

  const type = opts.type || (await inferAccountTypeForCompany(name))

  const account = await createAccount(
    {
      type,
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

/**
 * Push CRM sheet contacts into account_contacts (upsert by email/phone/name).
 * Best-effort: no-ops when there is no linked account or the table is missing.
 */
export async function syncCrmContactsToAccount(
  accountId: string,
  contacts: CrmContact[],
): Promise<void> {
  const list = normalizeContacts(contacts)
  if (!accountId || !list.length) return
  const existing = await listContacts(accountId)
  const byKey = new Map(existing.map((c) => [contactMatchKey(c), c]))
  const primary = primaryContact(list)

  for (const c of list) {
    const key = contactMatchKey(c)
    if (!key || !c.name.trim()) continue
    const match = byKey.get(key)
    await saveContact(
      accountId,
      {
        name: c.name.trim(),
        role: c.role || 'Other',
        email: c.email || '',
        phone: c.phone || '',
        whatsapp: c.phone || '',
        is_primary: Boolean(primary && primary.id === c.id),
      },
      match?.id,
    )
  }
}

/**
 * Push account_contacts back onto the linked CRM row's contacts jsonb (+ flat fields).
 */
export async function syncAccountContactsToCrm(
  account: Pick<Account, 'id' | 'name'>,
  accountContacts?: AccountContact[],
): Promise<void> {
  const crm = await findCrmForAccount(account)
  if (!crm) return
  const rows = accountContacts ?? (await listContacts(account.id))
  if (!rows.length) return

  const contacts: CrmContact[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email || '',
    phone: c.phone || c.whatsapp || '',
    role: c.is_primary ? 'Primary' : c.role || 'Other',
  }))
  const flat = flatFieldsFromContacts(contacts)
  const { error } = await db
    .from('crm')
    .update({
      contacts,
      ...flat,
      updated_at: new Date().toISOString(),
    })
    .eq('id', crm.id)
  if (error) {
    const msg = String((error as { message?: string }).message || error)
    if (/contacts|column/i.test(msg)) return
    throw error
  }
}
