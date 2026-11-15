import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import { withoutSoftDeleted } from './softDelete'

export type EngDocument = {
  id: string
  doc_no: string
  title: string
  discipline: string
  revision: string
  status: string
  notes: string
  deleted_at?: string | null
}

export type EngClaim = {
  id: string
  claim_no: string
  title: string
  amount_aed: number
  status: string
  notes: string
  deleted_at?: string | null
}

export async function listEngDocuments(opts?: {
  includeDeleted?: boolean
}): Promise<EngDocument[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('eng_document_registers')
    .select('id, doc_no, title, discipline, revision, status, notes, deleted_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  const rows = (data || []) as EngDocument[]
  return opts?.includeDeleted ? rows : withoutSoftDeleted(rows)
}

export async function createEngDocument(input: {
  docNo: string
  title: string
  discipline?: string
  revision?: string
}): Promise<void> {
  const { error } = await db.from('eng_document_registers').insert({
    doc_no: input.docNo.trim() || `DR-${Date.now().toString().slice(-5)}`,
    title: input.title.trim(),
    discipline: (input.discipline || '').trim(),
    revision: input.revision || 'A',
    status: 'draft',
  })
  if (error) throw error
}

export async function softDeleteEngDocument(id: string): Promise<void> {
  const { error } = await db
    .from('eng_document_registers')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreEngDocument(id: string): Promise<void> {
  const { error } = await db
    .from('eng_document_registers')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function listEngClaims(opts?: {
  includeDeleted?: boolean
}): Promise<EngClaim[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('eng_claims')
    .select('id, claim_no, title, amount_aed, status, notes, deleted_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  const rows = (data || []).map((r: EngClaim) => ({
    ...r,
    amount_aed: Number(r.amount_aed) || 0,
  }))
  return opts?.includeDeleted ? rows : withoutSoftDeleted(rows)
}

export async function createEngClaim(input: {
  claimNo: string
  title: string
  amountAed: number
}): Promise<void> {
  const { error } = await db.from('eng_claims').insert({
    claim_no: input.claimNo.trim() || `CL-${Date.now().toString().slice(-5)}`,
    title: input.title.trim(),
    amount_aed: Number(input.amountAed) || 0,
    status: 'draft',
  })
  if (error) throw error
}

export async function softDeleteEngClaim(id: string): Promise<void> {
  const { error } = await db
    .from('eng_claims')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreEngClaim(id: string): Promise<void> {
  const { error } = await db
    .from('eng_claims')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
