import { db } from './db'
import { errorCode, isMissingRelationError } from './errors'
import { nextAccountReference } from './accounts'
import type {
  Account,
  AccountActivity,
  AccountActivityKind,
  AccountContact,
  AccountType,
  AppUser,
} from './types'

export type AccountInput = Pick<
  Account,
  'type' | 'name' | 'industry' | 'country' | 'city' | 'website' | 'status' | 'owner_user_id' | 'source' | 'notes'
>

export type ContactInput = Pick<
  AccountContact,
  'name' | 'role' | 'email' | 'phone' | 'whatsapp' | 'is_primary'
>

/** Rows plus whether the accounts migration has been applied to this database. */
export async function listAccounts(): Promise<{ rows: Account[]; missingTable: boolean }> {
  const { data, error } = await db.from('accounts').select('*').order('name')
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as Account[], missingTable: false }
}

export async function getAccount(id: string): Promise<Account | null> {
  const { data, error } = await db.from('accounts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Account) || null
}

export async function listTeam(): Promise<AppUser[]> {
  const { data, error } = await db.from('app_users').select('*').order('name')
  if (error) return []
  return ((data || []) as AppUser[]).filter((u) => u.active !== false)
}

export async function createAccount(
  input: AccountInput,
  createdBy: string,
  knownRefs: string[],
): Promise<Account> {
  const refs = [...knownRefs]
  // Staff only see their own accounts, so the next number can already be taken.
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = new Date().toISOString()
    const row: Account = {
      ...input,
      id: crypto.randomUUID(),
      reference: nextAccountReference(input.type as AccountType, refs),
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    }
    const { error } = await db.from('accounts').insert(row)
    if (!error) return row
    if (errorCode(error) !== '23505') throw error
    refs.push(row.reference)
  }
  throw new Error('Could not find a free account reference. Try again.')
}

export async function updateAccount(id: string, patch: Partial<AccountInput>): Promise<void> {
  const { error } = await db
    .from('accounts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await db.from('accounts').delete().eq('id', id)
  if (error) throw error
}

export async function listContacts(accountId?: string): Promise<AccountContact[]> {
  let q = db.from('account_contacts').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as AccountContact[]
}

/** Save a contact. Marking one primary clears the flag on the others. */
export async function saveContact(
  accountId: string,
  input: ContactInput,
  existingId?: string,
): Promise<void> {
  if (input.is_primary) {
    const { error } = await db
      .from('account_contacts')
      .update({ is_primary: false })
      .eq('account_id', accountId)
    if (error) throw error
  }
  if (existingId) {
    const { error } = await db.from('account_contacts').update(input).eq('id', existingId)
    if (error) throw error
    return
  }
  const { error } = await db.from('account_contacts').insert({
    ...input,
    id: crypto.randomUUID(),
    account_id: accountId,
    created_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await db.from('account_contacts').delete().eq('id', id)
  if (error) throw error
}

export async function listActivities(accountId: string): Promise<AccountActivity[]> {
  const { data, error } = await db
    .from('account_activities')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as AccountActivity[]
}

export async function addActivity(
  accountId: string,
  kind: AccountActivityKind,
  body: string,
  author: { appUserId: string | null; email: string },
): Promise<void> {
  const { error } = await db.from('account_activities').insert({
    id: crypto.randomUUID(),
    account_id: accountId,
    user_id: author.appUserId,
    user_email: author.email,
    kind,
    body,
    created_at: new Date().toISOString(),
  })
  if (error) throw error
}

/** A system line on the timeline. Never blocks the action it describes. */
export async function logAccountEvent(
  accountId: string,
  body: string,
  author: { appUserId: string | null; email: string },
): Promise<void> {
  try {
    await addActivity(accountId, 'system', body, author)
  } catch (e) {
    console.error('Failed to log account event:', e)
  }
}

/** Link (or unlink with null) an invoice or quotation. Only account_id changes. */
export async function setDocumentAccount(
  table: 'invoices' | 'quotations',
  id: string,
  accountId: string | null,
): Promise<void> {
  const { error } = await db.from(table).update({ account_id: accountId }).eq('id', id)
  if (error) throw error
}
