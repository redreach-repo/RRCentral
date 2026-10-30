import { db } from './db'
import { companiesMatch, normalizeCompanyKey } from './customerFiles'
import type { Client, CrmEntry } from './types'

/** Bill-to fields for document letterheads — prefer clients row, fall back to CRM. */
export type BillToParty = {
  companyName: string
  primaryContact: string
  email: string
  phone: string
  address: string
  trn: string
}

/**
 * Known bill-to parties — used when clients/CRM rows are missing (e.g. migration
 * not yet applied on production). Matched via companiesMatch.
 */
const KNOWN_BILL_TO: BillToParty[] = [
  {
    companyName: 'Mass Allied Freighters L.L.C',
    primaryContact: '',
    email: '',
    phone: '+971 4 882 4433',
    address:
      'Grosvenor Business Tower, Office 1506,\nP.O. Box 6641, Barsha Heights, TECOM,\nDubai, UAE',
    trn: '100286214000003',
  },
]

function knownBillToFor(company: string): BillToParty | null {
  const name = company.trim()
  if (!name) return null
  return KNOWN_BILL_TO.find((p) => companiesMatch(p.companyName, name)) || null
}

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

export function resolveBillToParty(
  docClient: string,
  client: Client | null | undefined,
  crm: CrmEntry | null | undefined,
): BillToParty {
  const known = knownBillToFor(docClient || client?.company_name || crm?.company_name || '')
  const companyName = (
    client?.company_name ||
    crm?.company_name ||
    known?.companyName ||
    docClient ||
    ''
  ).trim()
  const primaryContact = (client?.primary_contact || crm?.primary_contact || known?.primaryContact || '').trim()
  const email = (client?.email || crm?.email_phone || known?.email || '').trim()
  const phone = (
    client?.mobile ||
    client?.office ||
    crm?.mobile_number ||
    crm?.office_number ||
    known?.phone ||
    ''
  ).trim()
  const address = (client?.address || crm?.address || known?.address || '').trim()
  const trn = (client?.trn || crm?.trn || known?.trn || '').trim()
  return { companyName, primaryContact, email, phone, address, trn }
}

/** One line under the bill-to company name on a quote, invoice or delivery note. */
export type BillToLine = { kind: 'address' | 'trn' | 'contact' | 'email' | 'phone'; text: string }

/**
 * Lines printed under the client name, in the Mass Allied Freighters layout:
 * address first, then TRN, then contact details. Empty fields are left out.
 */
export function billToLines(party: BillToParty): BillToLine[] {
  const lines: BillToLine[] = []
  for (const line of party.address.split(/\n+/)) {
    const text = line.trim()
    if (text) lines.push({ kind: 'address', text })
  }
  if (party.trn) lines.push({ kind: 'trn', text: `TRN: ${party.trn}` })
  if (party.primaryContact) lines.push({ kind: 'contact', text: party.primaryContact })
  if (party.email) lines.push({ kind: 'email', text: party.email })
  if (party.phone) lines.push({ kind: 'phone', text: `Tel: ${party.phone}` })
  return lines
}

/** Which bill-to fields an invoice is missing, so staff can fill them in before sending. */
export function missingBillToFields(party: BillToParty): Array<'address' | 'TRN'> {
  const missing: Array<'address' | 'TRN'> = []
  if (!party.address.trim()) missing.push('address')
  if (!party.trn.trim()) missing.push('TRN')
  return missing
}
