import type { CrmContact, CrmEntry } from './types'

export const CONTACT_ROLES = [
  'Primary',
  'Decision maker',
  'Accounts',
  'Operations',
  'Other',
] as const

export function newContact(partial?: Partial<CrmContact>): CrmContact {
  return {
    id: crypto.randomUUID(),
    name: '',
    email: '',
    phone: '',
    role: 'Primary',
    ...partial,
  }
}

/** Build contacts[] from legacy flat CRM fields when contacts is empty. */
export function hydrateContacts(entry: Partial<CrmEntry> | null | undefined): CrmContact[] {
  if (!entry) return []
  const existing = normalizeContacts(entry.contacts)
  if (existing.length > 0) return existing

  const name = String(entry.primary_contact || '').trim()
  const email = String(entry.email_phone || '').trim()
  const phone = String(entry.mobile_number || entry.office_number || '').trim()
  if (!name && !email && !phone) return []

  return [
    newContact({
      name,
      email: looksLikeEmail(email) ? email : '',
      phone: looksLikeEmail(email) ? phone : phone || email,
      role: 'Primary',
    }),
  ]
}

export function normalizeContacts(raw: unknown): CrmContact[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      return {
        id: String(r.id || crypto.randomUUID()),
        name: String(r.name || '').trim(),
        email: String(r.email || '').trim(),
        phone: String(r.phone || '').trim(),
        role: String(r.role || '').trim() || 'Other',
      } satisfies CrmContact
    })
    .filter((c): c is CrmContact => Boolean(c && (c.name || c.email || c.phone)))
}

/** Primary = first with role Primary, else first contact. */
export function primaryContact(contacts: CrmContact[]): CrmContact | null {
  const list = normalizeContacts(contacts)
  if (!list.length) return null
  return list.find((c) => c.role.toLowerCase() === 'primary') || list[0]
}

/** Mirror primary into legacy flat fields for Sheets / WhatsApp compatibility. */
export function flatFieldsFromContacts(contacts: CrmContact[]): {
  primary_contact: string
  email_phone: string
  mobile_number: string
  office_number: string
} {
  const p = primaryContact(contacts)
  if (!p) {
    return {
      primary_contact: '',
      email_phone: '',
      mobile_number: '',
      office_number: '',
    }
  }
  return {
    primary_contact: p.name,
    email_phone: p.email,
    mobile_number: p.phone,
    office_number: '',
  }
}

export function contactEmails(contacts: CrmContact[]): string[] {
  return normalizeContacts(contacts)
    .map((c) => c.email)
    .filter((e) => looksLikeEmail(e))
}

export function contactDisplay(contacts: CrmContact[]): { label: string; extra: number } {
  const list = normalizeContacts(contacts)
  if (!list.length) return { label: '—', extra: 0 }
  const p = primaryContact(list)!
  return { label: p.name || p.email || p.phone || '—', extra: Math.max(0, list.length - 1) }
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
