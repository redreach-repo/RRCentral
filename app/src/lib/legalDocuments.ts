/**
 * Legal document e-sign rules. Bundled into the legal-sign Edge Function.
 * Only pure modules — tokens reuse the portal/accept helpers.
 */

import { addDays, format, parseISO } from 'date-fns'
import { hashPortalToken, isPortalToken, newPortalToken } from './clientPortal'

export { defaultObligationsOnSign } from './obligationSpawn'
export type { SpawnObligationInput, SpawnObligationRow } from './obligationSpawn'

export {
  hashPortalToken as hashLegalSignToken,
  isPortalToken as isLegalSignToken,
  newPortalToken as newLegalSignToken,
}

export const LEGAL_SIGN_LINK_DAYS = 30
export const LEGAL_SIGN_PDF_MAX_CHARS = 8_000_000
/** Max length of a PNG data-URL signature (about 400 KB raw). */
export const LEGAL_SIGNATURE_MAX_CHARS = 600_000

/** Client-facing copy for `/sign` — assent evidence, not UAE QES (see COMPLIANCE_NOTES § E-sign). */
export const LEGAL_SIGN_ASSENT_BLURB =
  'Read the PDF, draw your signature, type your full name and date. We keep your name, signature, date, time and internet address as an electronic signing record of your assent. This is not a UAE Qualified Electronic Signature (QES).'

export const LEGAL_SIGN_DONE_BLURB =
  'A copy of this signing record is kept in Red Reach’s files. It is an assent capture, not a UAE Qualified Electronic Signature.'

export type LegalDocType = 'nda' | 'service_agreement' | 'other'
export type LegalDocStatus = 'draft' | 'sent' | 'signed' | 'expired' | 'void'

export type LegalSignLinkRow = {
  id: string
  legal_document_id: string
  label: string
  created_by: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_opened_at: string | null
  signed_at: string | null
  signed_name: string
}

export type LegalSignLinkState = 'signed' | 'revoked' | 'expired' | 'active'

export function legalSignLinkState(
  row: Pick<LegalSignLinkRow, 'signed_at' | 'revoked_at' | 'expires_at'>,
  now: Date = new Date(),
): LegalSignLinkState {
  if (row.signed_at) return 'signed'
  if (row.revoked_at) return 'revoked'
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) return 'expired'
  return 'active'
}

export const LEGAL_SIGN_STATE_LABELS: Record<LegalSignLinkState, string> = {
  signed: 'Signed',
  revoked: 'Turned off',
  expired: 'Expired',
  active: 'Active',
}

export function legalSignLinkExpiry(now: Date = new Date(), days = LEGAL_SIGN_LINK_DAYS): string {
  return addDays(now, days).toISOString()
}

/** Client opens this; token after # so it never hits server access logs. */
export function legalSignLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/sign#${token}`
}

export function signProblem(
  input: { name: string; date: string; agreed: boolean; signaturePng: string },
  now: Date = new Date(),
): string | null {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 200) return 'Type your full name as it should appear on the document.'
  if (!input.agreed) return 'Tick the box to confirm you agree to this document.'
  const day = input.date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Choose the date you are signing.'
  const parsed = parseISO(day)
  if (Number.isNaN(parsed.getTime())) return 'Choose a valid date.'
  const today = format(now, 'yyyy-MM-dd')
  const earliest = format(addDays(now, -7), 'yyyy-MM-dd')
  if (day > today) return 'The signature date cannot be in the future.'
  if (day < earliest) return 'The signature date is too far in the past. Use today.'
  const sig = input.signaturePng.trim()
  if (!sig.startsWith('data:image/png;base64,')) return 'Please draw your signature in the box.'
  if (sig.length < 80) return 'Please draw your signature in the box.'
  if (sig.length > LEGAL_SIGNATURE_MAX_CHARS) return 'That signature image is too large. Please redraw it.'
  return null
}

export type LegalSignView = {
  title: string
  company: string
  party_name: string
  doc_type: string
  status: LegalSignLinkState
  has_pdf: boolean
  signed_name: string
  signed_at: string | null
}

export function legalSignView(
  doc: { title: string; company_name: string; party_name: string; doc_type: string },
  link: Pick<LegalSignLinkRow, 'signed_at' | 'signed_name' | 'revoked_at' | 'expires_at'> & { has_pdf?: boolean },
  now: Date = new Date(),
): LegalSignView {
  return {
    title: doc.title || 'Document',
    company: doc.company_name || '',
    party_name: doc.party_name || '',
    doc_type: doc.doc_type || 'nda',
    status: legalSignLinkState(link, now),
    has_pdf: Boolean(link.has_pdf),
    signed_name: link.signed_name || '',
    signed_at: link.signed_at,
  }
}

export function legalDocLabel(docType: string): string {
  if (docType === 'nda') return 'NDA'
  if (docType === 'service_agreement') return 'Service agreement'
  return 'Document'
}
