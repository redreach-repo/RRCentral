import { db } from './db'
import type { Attachment, DeliveryNote } from './types'

/** Signed / scanned delivery note PDF or photo stored against the DN. */
export const SIGNED_DELIVERY_NOTE_ENTITY = 'delivery_note_signed'

export type PendingSignedFile = { name: string; dataUrl: string; mime?: string }

export function deliveryNoteAttachmentRefs(
  note: Pick<DeliveryNote, 'reference_number' | 'id'>,
): string[] {
  return [note.reference_number, note.id]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
}

export async function loadSignedDeliveryNoteAttachments(
  note: Pick<DeliveryNote, 'reference_number' | 'id'>,
): Promise<Attachment[]> {
  const refs = new Set(deliveryNoteAttachmentRefs(note))
  if (!refs.size) return []
  const { data, error } = await db
    .from('attachments')
    .select('*')
    .eq('entity_type', SIGNED_DELIVERY_NOTE_ENTITY)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return ((data || []) as Attachment[]).filter((a) => refs.has(String(a.entity_ref || '').trim()))
}

export async function saveSignedDeliveryNoteAttachments(opts: {
  note: Pick<DeliveryNote, 'reference_number' | 'id'>
  files: PendingSignedFile[]
  uploadedBy: string
}): Promise<string> {
  const entityRef =
    String(opts.note.reference_number || '').trim() || String(opts.note.id || '').trim()
  if (!entityRef) throw new Error('Delivery note needs a reference before saving a signed copy')
  for (const file of opts.files) {
    const { error } = await db.from('attachments').insert({
      entity_type: SIGNED_DELIVERY_NOTE_ENTITY,
      entity_ref: entityRef,
      file_name: file.name,
      storage_path: '',
      url: file.dataUrl,
      uploaded_by: opts.uploadedBy,
      uploaded_at: new Date().toISOString(),
    })
    if (error) throw error
  }
  return entityRef
}

export async function deleteSignedDeliveryNoteAttachment(id: string): Promise<void> {
  const { error } = await db.from('attachments').delete().eq('id', id)
  if (error) throw error
}
