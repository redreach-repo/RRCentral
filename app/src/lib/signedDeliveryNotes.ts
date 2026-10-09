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
  void opts
  // Signed DNs are WorkDrive-only via customer_documents + LinkWorkDriveModal.
  // Never persist data: blobs (or any attachment row) from this path.
  throw new Error(
    'Store signed delivery notes on Zoho WorkDrive and link them from the delivery note (Customer files), not as database blobs.',
  )
}

export async function deleteSignedDeliveryNoteAttachment(id: string): Promise<void> {
  const { error } = await db.from('attachments').delete().eq('id', id)
  if (error) throw error
}
