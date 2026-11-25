/**
 * Calls the client-po-file Edge Function: what is set up, read a PO file
 * (nothing saved), and file it in the client's Google Drive folder.
 */
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { ExtractedPo } from './clientPoReader'

export type ClientPoSetup = {
  /** ANTHROPIC_API_KEY is set, so POs can be read. */
  reader: boolean
  /** Google Drive is set up and connected, so files can be kept. */
  drive: boolean
  /** The function itself answered (false: not deployed yet). */
  reachable: boolean
}

export const CLIENT_PO_SETUP_OFF: ClientPoSetup = { reader: false, drive: false, reachable: false }

async function callPoFile<T>(body: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured()) throw new Error('RR Central is not connected to Supabase')
  const { data, error } = await getSupabaseClient().functions.invoke('client-po-file', { body })
  if (error) {
    // The function answers { error } with a 4xx/5xx; show that text, not "non-2xx".
    const ctx = (error as { context?: Response }).context
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    throw new Error((detail as { error?: string } | null)?.error || error.message || 'The PO service did not answer')
  }
  const res = data as T & { error?: string }
  if (res?.error) throw new Error(res.error)
  return res
}

export async function getClientPoSetup(): Promise<ClientPoSetup> {
  if (!isSupabaseConfigured()) return CLIENT_PO_SETUP_OFF
  try {
    const res = await callPoFile<{ reader: boolean; drive: boolean }>({ action: 'status' })
    return { reader: Boolean(res.reader), drive: Boolean(res.drive), reachable: true }
  } catch {
    return CLIENT_PO_SETUP_OFF
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export type PoUpload = { filename: string; contentType: string; base64: string; bytes: number }

export async function readClientPoFile(file: PoUpload): Promise<{ po: ExtractedPo; warnings: string[] }> {
  return callPoFile({
    action: 'read',
    filename: file.filename,
    content_type: file.contentType,
    content_base64: file.base64,
  })
}

export async function fileClientPoInDrive(
  file: PoUpload,
  clientId: string,
  poNumber: string,
  /** The linked quotation's number, put in the Drive file name. */
  quoteRef = '',
): Promise<{ id: string; url: string; folder_url: string }> {
  return callPoFile({
    action: 'file',
    client_id: clientId,
    po_number: poNumber,
    quote_ref: quoteRef,
    filename: file.filename,
    content_type: file.contentType,
    content_base64: file.base64,
  })
}

/**
 * Renames a PO already in Google Drive after its quote is linked, e.g.
 * "PO 4200050362 - Quote RR-01-26003 - scan.pdf". The function reads the PO
 * (as the signed-in user) for its number, file and quote; nothing else is sent.
 */
export async function relabelClientPoInDrive(poId: string): Promise<{ id: string; name: string }> {
  return callPoFile({ action: 'relabel', po_id: poId })
}
