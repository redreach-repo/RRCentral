/**
 * Quick add (Wave 4, PR T): one phone first screen to log a call or a new
 * lead in a few seconds. Type the number; a known contact or CRM lead shows
 * up and one tap logs the call on it. An unknown number becomes a new lead
 * with just a name.
 */
import { emailKey, phoneKey } from './duplicates'

export type QuickMatch =
  | { kind: 'contact'; id: string; accountId: string; accountName: string; accountType: string; name: string; phone: string }
  | { kind: 'crm'; id: string; company: string; name: string; phone: string; stage: string }

type ContactRow = { id: string; account_id: string; name: string; phone: string; whatsapp: string; email?: string }
type AccountRow = { id: string; name: string; type: string }
type CrmRow = { id: string; company_name: string; primary_contact: string; mobile_number: string; office_number: string; pipeline_stage: string }

/** At least 8 digits before searching. */
export const QUICK_MIN_DIGITS = 8

/** Contacts and CRM leads with this phone. */
export function quickMatches(
  phone: string,
  input: { contacts: ContactRow[]; accounts: AccountRow[]; crm: CrmRow[] },
  countryCode = '971',
): QuickMatch[] {
  const key = phoneKey(phone, countryCode)
  if (!key) return []
  const accounts = new Map(input.accounts.map((a) => [a.id, a]))
  const out: QuickMatch[] = []
  for (const c of input.contacts) {
    if (phoneKey(c.phone, countryCode) !== key && phoneKey(c.whatsapp, countryCode) !== key) continue
    const a = accounts.get(c.account_id)
    if (!a) continue
    out.push({ kind: 'contact', id: c.id, accountId: a.id, accountName: a.name, accountType: a.type, name: c.name, phone: c.phone || c.whatsapp })
  }
  for (const r of input.crm) {
    if (phoneKey(r.mobile_number, countryCode) !== key && phoneKey(r.office_number, countryCode) !== key) continue
    out.push({ kind: 'crm', id: r.id, company: r.company_name, name: r.primary_contact, phone: r.mobile_number || r.office_number, stage: r.pipeline_stage })
  }
  return out.slice(0, 10)
}

export const CALL_OUTCOMES = ['Spoke to them', 'No answer', 'Left a message', 'Call back later'] as const
export type CallOutcome = (typeof CALL_OUTCOMES)[number]

/** The timeline line for a quick call. */
export function quickCallBody(outcome: CallOutcome, note: string): string {
  const n = note.trim()
  return n ? `${outcome}. ${n}` : `${outcome}.`
}

export type QuickLeadPipeline = 'ai_crm' | 'crm'
export const QUICK_LEAD_PIPELINES: { value: QuickLeadPipeline; label: string }[] = [
  { value: 'ai_crm', label: 'AI CRM sales' },
  { value: 'crm', label: 'CRM (other desks)' },
]

/** Why a new lead cannot be saved yet, or null. */
export function quickLeadProblem(input: { phone: string; name: string; email?: string }, countryCode = '971'): string | null {
  if (!phoneKey(input.phone, countryCode)) return 'Type the phone number first'
  if (input.name.trim().length < 2) return 'Add a name'
  if (input.email && input.email.trim() && !emailKey(input.email)) return 'That email does not look right'
  return null
}

/** The first line of a quick lead's note. */
export function quickLeadNote(source: string, note: string): string {
  return [`New lead from ${source || 'a call'} (Quick add)`, note.trim()].filter(Boolean).join('\n')
}

/** Digits only, for the phone box. Keeps a leading +. */
export function cleanPhoneInput(raw: string): string {
  const plus = raw.trim().startsWith('+')
  const digits = raw.replace(/\D/g, '').slice(0, 15)
  return plus ? `+${digits}` : digits
}
