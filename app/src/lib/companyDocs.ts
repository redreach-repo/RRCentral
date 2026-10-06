import { db } from './db'
import { isMissingRelationError } from './errors'
import type { CompanyDocument, CompanyDocumentCategory } from './types'
import { WORKDRIVE_STORAGE_PROVIDER } from './customerFiles'

export const COMPANY_DOC_CATEGORIES: {
  id: CompanyDocumentCategory
  label: string
  hint: string
}[] = [
  { id: 'trade_license', label: 'Trade license', hint: 'Commercial / trade licence' },
  { id: 'vat_certificate', label: 'VAT certificate', hint: 'Tax registration certificate' },
  { id: 'chamber_certificate', label: 'Chamber certificate', hint: 'Chamber of commerce' },
  { id: 'insurance', label: 'Insurance', hint: 'Company insurance policies' },
  { id: 'memorandum', label: 'MOA / AOA', hint: 'Memorandum or articles of association' },
  { id: 'other', label: 'Other', hint: 'Other company papers' },
]

export function companyDocCategoryLabel(category: string): string {
  return COMPANY_DOC_CATEGORIES.find((c) => c.id === category)?.label || category
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function listCompanyDocuments(): Promise<{
  rows: CompanyDocument[]
  missingTable: boolean
}> {
  const { data, error } = await db
    .from('company_documents')
    .select('*')
    .order('category', { ascending: true })
    .order('uploaded_at', { ascending: false })

  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as CompanyDocument[], missingTable: false }
}

export type CompanyDocInput = {
  category: CompanyDocumentCategory
  title: string
  file_name?: string
  drive_url: string
  notes?: string
  expires_on?: string | null
  uploaded_by?: string
}

export async function saveCompanyDocument(
  input: CompanyDocInput,
  existingId?: string | null,
): Promise<CompanyDocument> {
  const driveUrl = input.drive_url.trim()
  if (!driveUrl || !isHttpUrl(driveUrl)) {
    throw new Error('Paste a valid WorkDrive (or file) share link starting with https://')
  }
  const title = input.title.trim() || companyDocCategoryLabel(input.category)
  const payload = {
    category: input.category,
    title,
    file_name: (input.file_name || '').trim(),
    drive_url: driveUrl,
    notes: (input.notes || '').trim(),
    expires_on: input.expires_on?.trim() || null,
    storage_provider: WORKDRIVE_STORAGE_PROVIDER,
    uploaded_by: (input.uploaded_by || '').trim(),
    uploaded_at: new Date().toISOString(),
  }

  if (existingId) {
    const { data, error } = await db
      .from('company_documents')
      .update(payload)
      .eq('id', existingId)
      .select('*')
      .single()
    if (error) {
      if (isMissingRelationError(error)) {
        throw new Error(
          'Run supabase/migrations/20261006180000_company_documents.sql in the SQL Editor first.',
        )
      }
      throw error
    }
    return data as CompanyDocument
  }

  const { data, error } = await db.from('company_documents').insert(payload).select('*').single()
  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error(
        'Run supabase/migrations/20261006180000_company_documents.sql in the SQL Editor first.',
      )
    }
    throw error
  }
  return data as CompanyDocument
}

export async function deleteCompanyDocument(id: string): Promise<void> {
  const { error } = await db.from('company_documents').delete().eq('id', id)
  if (error) throw error
}
