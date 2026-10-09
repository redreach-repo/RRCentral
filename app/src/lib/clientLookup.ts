import { db } from './db'
import { companiesMatch, normalizeCompanyKey } from './customerFiles'
import type { Client, CrmEntry } from './types'

/**
 * Resolve a clients-row for quote/invoice bill-to, tolerating L.L.C / spacing variants.
 */
export async function findClientByCompany(company: string): Promise<Client | null> {
  const name = company.trim()
  if (!name) return null

  const exact = await db.from('clients').select('*').ilike('company_name', name).limit(5)
  if (!exact.error && exact.data?.length) {
    const rows = exact.data as Client[]
    const hit =
      rows.find((r) => r.company_name.trim().toLowerCase() === name.toLowerCase()) ||
      rows.find((r) => companiesMatch(r.company_name, name))
    if (hit) return hit
  }

  const token = normalizeCompanyKey(name).split(' ').filter((t) => t.length >= 3)[0] || name
  const loose = await db.from('clients').select('*').ilike('company_name', `%${token}%`).limit(25)
  if (loose.error || !loose.data?.length) return null
  return ((loose.data as Client[]).find((r) => companiesMatch(r.company_name, name)) as Client) || null
}

/** Bill-to fields for document letterheads — prefer clients row, fall back to CRM. */
export type BillToParty = {
  companyName: string
  primaryContact: string
  email: string
  phone: string
  address: string
  trn: string
}

export function resolveBillToParty(
  docClient: string,
  client: Client | null | undefined,
  crm: CrmEntry | null | undefined,
): BillToParty {
  return {
    companyName: (client?.company_name || crm?.company_name || docClient || '').trim(),
    primaryContact: (client?.primary_contact || crm?.primary_contact || '').trim(),
    email: (client?.email || crm?.email_phone || '').trim(),
    phone: (client?.mobile || client?.office || crm?.mobile_number || crm?.office_number || '').trim(),
    address: (client?.address || crm?.address || '').trim(),
    trn: (client?.trn || crm?.trn || '').trim(),
  }
}
