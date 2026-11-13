import { db } from './db'
import { generateReference } from './referenceNumber'

export type NumberingDocType =
  | 'quotation'
  | 'invoice'
  | 'delivery_note'
  | 'account'
  | 'expense'
  | 'other'

export type NumberingSequence = {
  id: string
  doc_type: NumberingDocType
  division_code: string
  prefix: string
  year_yy: string
  last_seq: number
  pad: number
  active: boolean
}

function defaultPrefix(docType: NumberingDocType, prefix?: string): string {
  if (prefix && prefix.trim()) return prefix.trim().toUpperCase()
  if (docType === 'delivery_note') return 'DN'
  if (docType === 'account') return 'AC'
  return 'RR'
}

/**
 * Allocate the next PREFIX-DIV-YYseq reference.
 * Prefers the tenant-scoped RPC (atomic). Falls back to client-side max+1
 * when local mode / migration not applied yet.
 */
export async function allocateReference(opts: {
  docType: NumberingDocType
  divisionCode: string
  prefix?: string
  existingRefs?: string[]
}): Promise<string> {
  const prefix = defaultPrefix(opts.docType, opts.prefix)
  const divisionCode = String(opts.divisionCode || '01').padStart(2, '0')

  try {
    const { data, error } = await db.rpc('rr_allocate_reference', {
      p_doc_type: opts.docType,
      p_division_code: divisionCode,
      p_prefix: prefix,
    })
    if (!error && data != null && String(data).trim()) {
      return String(data).trim()
    }
  } catch {
    /* fall through to client-side */
  }

  return generateReference(divisionCode, opts.existingRefs || [], prefix)
}

export async function listNumberingSequences(): Promise<NumberingSequence[]> {
  const { data, error } = await db
    .from('numbering_sequences')
    .select('id, doc_type, division_code, prefix, year_yy, last_seq, pad, active')
    .eq('active', true)
    .order('doc_type')
    .order('division_code')
  if (error || !data) return []
  return data as NumberingSequence[]
}

export function previewNextReference(seq: NumberingSequence): string {
  const next = (Number(seq.last_seq) || 0) + 1
  const pad = Math.max(2, Math.min(6, Number(seq.pad) || 3))
  return `${seq.prefix}-${seq.division_code}-${seq.year_yy}${String(next).padStart(pad, '0')}`
}
