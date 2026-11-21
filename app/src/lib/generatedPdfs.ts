/**
 * Saves the PDF the app's Download PDF makes into the private "generated-pdfs"
 * bucket, so the AI connector can hand out exactly that file (get_quote_pdf,
 * get_invoice_pdf, get_delivery_note_pdf). The bucket is never public: the
 * connector only gives out 1 hour signed links. Storage rules
 * (20261326090000_generated_pdfs.sql) only let people who can see the
 * document save or read its PDF.
 */
import { db, isSupabaseConfigured } from './db'
import { GENERATED_PDF_BUCKET, generatedPdfPath, type GeneratedPdfKind } from './highmastMcp'

export type SavedPdf = { path: string; size_bytes: number }

/** Upload (overwrite) the document's PDF. Returns null when there is nowhere to save it. */
export async function saveGeneratedPdf(kind: GeneratedPdfKind, number: string, blob: Blob): Promise<SavedPdf | null> {
  const path = generatedPdfPath(kind, number)
  if (!path || !isSupabaseConfigured() || !db.storage) return null
  const { error } = await db.storage.from(GENERATED_PDF_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'application/pdf',
    cacheControl: '60',
  })
  if (error) throw error
  return { path, size_bytes: blob.size }
}

/** Same, but never throws: saving a copy must not get in the way of a download. */
export async function trySaveGeneratedPdf(kind: GeneratedPdfKind, number: string, blob: Blob): Promise<SavedPdf | null> {
  try {
    return await saveGeneratedPdf(kind, number, blob)
  } catch {
    return null
  }
}
