import { db } from './db'
import { findClientByCompany, resolveBillToParty } from './clientLookup'
import { companiesMatch } from './customerFiles'
import type { Client } from './types'

/** Address and TRN typed on an invoice or quotation form. */
export type BillToDraft = { address: string; trn: string }

export const EMPTY_BILL_TO: BillToDraft = { address: '', trn: '' }

/** The saved client a form's Client field points at, tolerating L.L.C / spacing variants. */
export function matchClient(clients: Client[], name: string): Client | null {
  const n = name.trim()
  if (!n) return null
  return (
    clients.find((c) => c.company_name.trim().toLowerCase() === n.toLowerCase()) ||
    clients.find((c) => companiesMatch(c.company_name, n)) ||
    null
  )
}

/** Address and TRN to prefill for a client name (saved client first, then known letterheads). */
export function billToDraftFor(clients: Client[], name: string): BillToDraft | null {
  const client = matchClient(clients, name)
  const party = resolveBillToParty(name, client, null)
  if (!client && !party.address && !party.trn) return null
  return { address: party.address, trn: party.trn }
}

/**
 * Fields to write back to the client record. Only filled-in values that differ
 * are written, so leaving a field blank never wipes what the client already has.
 */
export function clientBillToPatch(existing: Pick<Client, 'address' | 'trn'> | null, draft: BillToDraft): Partial<BillToDraft> {
  const patch: Partial<BillToDraft> = {}
  const address = draft.address.trim()
  const trn = draft.trn.trim()
  if (address && address !== (existing?.address || '').trim()) patch.address = address
  if (trn && trn !== (existing?.trn || '').trim()) patch.trn = trn
  return patch
}

export type SaveBillToResult = 'created' | 'updated' | 'unchanged'

/**
 * Keep the client record in step with what was typed on the document: update
 * the matching client, or create one when the name is new and details were given.
 */
export async function saveClientBillTo(name: string, draft: BillToDraft): Promise<SaveBillToResult> {
  const company = name.trim()
  if (!company) return 'unchanged'
  const existing = await findClientByCompany(company)
  const patch = clientBillToPatch(existing, draft)
  if (Object.keys(patch).length === 0) return 'unchanged'
  if (existing) {
    const { error } = await db.from('clients').update(patch).eq('id', existing.id)
    if (error) throw error
    return 'updated'
  }
  const { error } = await db.from('clients').insert({
    company_name: company,
    address: patch.address || '',
    trn: patch.trn || '',
    notes: 'Added from an invoice or quotation',
  })
  if (error) throw error
  return 'created'
}
