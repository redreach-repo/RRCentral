/**
 * Pick which company contact a quotation is addressed to when CRM/clients
 * store more than one person.
 */

import { hydrateContacts, normalizeContacts, primaryContact } from './contacts'
import { companiesMatch } from './customerFiles'
import type { Client, CrmContact, CrmEntry } from './types'

export type QuoteContactFields = {
  contact_name: string
  contact_email: string
  contact_phone: string
}

export const EMPTY_QUOTE_CONTACT: QuoteContactFields = {
  contact_name: '',
  contact_email: '',
  contact_phone: '',
}

/** Label for the contact picker (role · name · email/phone). */
export function quoteContactLabel(c: CrmContact): string {
  const bits = [c.role, c.name, c.email || c.phone].filter(Boolean)
  return bits.join(' · ')
}

export function contactToQuoteFields(c: CrmContact | null | undefined): QuoteContactFields {
  if (!c) return { ...EMPTY_QUOTE_CONTACT }
  return {
    contact_name: (c.name || '').trim(),
    contact_email: (c.email || '').trim(),
    contact_phone: (c.phone || '').trim(),
  }
}

/** Contacts for a company name: CRM first, then Clients table. */
export function contactsForCompany(
  company: string,
  opts: { clients?: Client[]; crm?: Array<Pick<CrmEntry, 'company_name' | 'contacts' | 'primary_contact' | 'email_phone' | 'mobile_number' | 'office_number'>> } = {},
): CrmContact[] {
  const name = company.trim()
  if (!name) return []

  const crmHit =
    (opts.crm || []).find((r) => companiesMatch(r.company_name, name)) ||
    (opts.crm || []).find((r) => r.company_name.trim().toLowerCase() === name.toLowerCase())
  if (crmHit) {
    const list = hydrateContacts(crmHit)
    if (list.length) return list
  }

  const clientHit =
    (opts.clients || []).find((c) => companiesMatch(c.company_name, name)) ||
    (opts.clients || []).find((c) => c.company_name.trim().toLowerCase() === name.toLowerCase())
  if (clientHit) {
    return hydrateContacts({
      primary_contact: clientHit.primary_contact,
      email_phone: clientHit.email,
      mobile_number: clientHit.mobile,
      office_number: clientHit.office,
      contacts: clientHit.contacts,
    })
  }
  return []
}

/**
 * Default selection when opening a quote for a company:
 * - match saved quote contact fields if present
 * - else Primary / first contact when there is at least one
 */
export function resolveQuoteContactSelection(
  contacts: CrmContact[],
  saved?: Partial<QuoteContactFields> | null,
): { contactId: string; fields: QuoteContactFields } {
  const list = normalizeContacts(contacts)
  if (!list.length) return { contactId: '', fields: { ...EMPTY_QUOTE_CONTACT } }

  const savedName = String(saved?.contact_name || '').trim().toLowerCase()
  const savedEmail = String(saved?.contact_email || '').trim().toLowerCase()
  if (savedName || savedEmail) {
    const match =
      list.find(
        (c) =>
          (savedEmail && c.email.toLowerCase() === savedEmail) ||
          (savedName && c.name.toLowerCase() === savedName),
      ) || null
    if (match) return { contactId: match.id, fields: contactToQuoteFields(match) }
    // Keep free-typed saved values even if not in the list anymore.
    return {
      contactId: '',
      fields: {
        contact_name: String(saved?.contact_name || '').trim(),
        contact_email: String(saved?.contact_email || '').trim(),
        contact_phone: String(saved?.contact_phone || '').trim(),
      },
    }
  }

  const p = primaryContact(list)
  return { contactId: p?.id || list[0].id, fields: contactToQuoteFields(p || list[0]) }
}

/** Whether the quotation editor should show a contact chooser. */
export function shouldShowQuoteContactPicker(contacts: CrmContact[]): boolean {
  return normalizeContacts(contacts).length > 1
}
