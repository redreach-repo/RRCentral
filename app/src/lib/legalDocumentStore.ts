import { db } from './db'
import { isMissingRelationError } from './errors'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import {
  hashLegalSignToken,
  LEGAL_SIGN_PDF_MAX_CHARS,
  legalSignLink,
  legalSignLinkExpiry,
  newLegalSignToken,
  type LegalDocStatus,
  type LegalDocType,
} from './legalDocuments'
import type { LegalDocument, LegalSignLink, LegalSignature } from './types'

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

export async function listLegalDocuments(company: string): Promise<{ rows: LegalDocument[]; missingTable: boolean }> {
  const name = company.trim()
  if (!name) return { rows: [], missingTable: false }
  const { data, error } = await db
    .from('legal_documents')
    .select('*')
    .ilike('company_name', name)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as LegalDocument[], missingTable: false }
}

export async function createLegalDocument(input: {
  companyName: string
  crmId?: string
  docType?: LegalDocType
  title: string
  partyName: string
  partyEmail?: string
  partyCompany?: string
  templateId?: string | null
  templateVersion?: number | null
  createdBy: string
  notes?: string
}): Promise<LegalDocument> {
  const now = new Date().toISOString()
  const row = {
    id: crypto.randomUUID(),
    company_name: input.companyName.trim(),
    crm_id: input.crmId || '',
    doc_type: input.docType || 'nda',
    title: input.title.trim() || 'Non-disclosure agreement',
    status: 'draft' as LegalDocStatus,
    party_name: input.partyName.trim(),
    party_email: (input.partyEmail || '').trim(),
    party_company: (input.partyCompany || input.companyName).trim(),
    template_id: input.templateId || null,
    template_version: input.templateVersion ?? null,
    related_ref: '',
    customer_document_id: null,
    drive_url: '',
    unsigned_file_name: '',
    signed_file_name: '',
    created_by: input.createdBy,
    created_at: now,
    updated_at: now,
    sent_at: null,
    signed_at: null,
    expires_at: null,
    voided_at: null,
    notes: input.notes || '',
  }
  const { data, error } = await db.from('legal_documents').insert(row).select('*').maybeSingle()
  if (error) throw error
  return data as LegalDocument
}

export async function voidLegalDocument(id: string): Promise<void> {
  const now = new Date().toISOString()
  check(
    await db
      .from('legal_documents')
      .update({ status: 'void', voided_at: now, updated_at: now })
      .eq('id', id)
      .neq('status', 'signed'),
  )
}

export async function listSignLinks(legalDocumentId: string): Promise<LegalSignLink[]> {
  const { data, error } = await db
    .from('legal_sign_links')
    .select('*')
    .eq('legal_document_id', legalDocumentId)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as LegalSignLink[]
}

export async function listSignatures(legalDocumentId: string): Promise<LegalSignature[]> {
  const { data, error } = await db
    .from('legal_signatures')
    .select('id, link_id, legal_document_id, signed_name, signed_date, signed_at, ip, user_agent')
    .eq('legal_document_id', legalDocumentId)
    .order('signed_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as LegalSignature[]
}

/** Create a sign link and store the unsigned PDF. Returns the client URL (token shown once). */
export async function createLegalSignLink(input: {
  document: LegalDocument
  pdfBase64: string
  fileName: string
  label?: string
  createdBy: string
  appUrl: string
  expiresAt?: string
}): Promise<{ link: LegalSignLink; url: string; token: string }> {
  const pdf = input.pdfBase64.trim()
  if (!pdf) throw new Error('Generate the NDA PDF before sending.')
  if (pdf.length > LEGAL_SIGN_PDF_MAX_CHARS) throw new Error('That PDF is too large to send for signature.')

  const token = newLegalSignToken()
  const tokenHash = await hashLegalSignToken(token)
  const now = new Date().toISOString()
  const linkId = crypto.randomUUID()
  const expiresAt = input.expiresAt || legalSignLinkExpiry()

  check(
    await db.from('legal_sign_links').insert({
      id: linkId,
      legal_document_id: input.document.id,
      label: input.label || input.document.party_name || 'Sign link',
      token_hash: tokenHash,
      created_by: input.createdBy,
      created_at: now,
      expires_at: expiresAt,
      revoked_at: null,
      last_opened_at: null,
      signed_at: null,
      signed_name: '',
    }),
  )
  check(await db.from('legal_sign_pdfs').insert({ link_id: linkId, pdf_base64: pdf }))
  check(
    await db
      .from('legal_documents')
      .update({
        status: 'sent',
        sent_at: now,
        updated_at: now,
        expires_at: expiresAt,
        unsigned_file_name: input.fileName || 'NDA.pdf',
      })
      .eq('id', input.document.id),
  )

  const link: LegalSignLink = {
    id: linkId,
    legal_document_id: input.document.id,
    label: input.label || input.document.party_name || 'Sign link',
    created_by: input.createdBy,
    created_at: now,
    expires_at: expiresAt,
    revoked_at: null,
    last_opened_at: null,
    signed_at: null,
    signed_name: '',
  }
  return { link, url: legalSignLink(input.appUrl, token), token }
}

export async function revokeLegalSignLink(linkId: string): Promise<void> {
  const now = new Date().toISOString()
  check(
    await db
      .from('legal_sign_links')
      .update({ revoked_at: now })
      .eq('id', linkId)
      .is('signed_at', null),
  )
}

export type LegalSignViewResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status?: number }

export async function callLegalSign(
  token: string,
  body: Record<string, unknown> = {},
): Promise<LegalSignViewResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'RR Central is not connected to Supabase.' }
  const { data, error } = await getSupabaseClient().functions.invoke('legal-sign', {
    body: { token, ...body },
  })
  if (error) {
    let message = 'This link does not work any more. Ask Red Reach for a new one.'
    let status: number | undefined
    try {
      const errBody = await (error as { context?: Response }).context?.json()
      if (errBody?.error) message = String(errBody.error)
      status = (error as { context?: Response }).context?.status
    } catch {
      // keep default
    }
    return { ok: false, error: message, status }
  }
  return { ok: true, data: (data || {}) as Record<string, unknown> }
}
