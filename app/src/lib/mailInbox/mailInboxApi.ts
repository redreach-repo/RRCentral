/**
 * Calls the mail-inbox Edge Function. The Zoho keys and access token stay on
 * the server; this only ever receives folders, email lists and email content.
 */
import { getSupabaseClient, isSupabaseConfigured } from '../supabaseConfig'
import type { MailFolder, MailListItem, MailMessageFull } from './mailInbox'

export class MailSetupError extends Error {}

async function callMail<T>(body: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured()) throw new MailSetupError('Mail needs the cloud database (Supabase), not local mode.')
  const { data, error } = await getSupabaseClient().functions.invoke('mail-inbox', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const status = ctx?.status
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    const msg = (detail as { error?: string } | null)?.error
    if (status === 404 || (!msg && /Failed to send a request/i.test(error.message))) {
      throw new MailSetupError('The mail service is not deployed yet. An admin deploys mail-inbox from Actions, Deploy Edge Functions.')
    }
    if ((detail as { setup?: boolean } | null)?.setup) throw new MailSetupError(msg || 'Zoho Mail is not connected')
    throw new Error(msg || error.message || 'The mail service did not answer')
  }
  const res = data as T & { error?: string }
  if (res?.error) throw new Error(res.error)
  return res
}

export async function getMailStatus(): Promise<{ connected: boolean; address: string }> {
  const res = await callMail<{ connected: boolean; address: string }>({ action: 'status' })
  return { connected: Boolean(res.connected), address: String(res.address || '') }
}

export async function listMailFolders(): Promise<MailFolder[]> {
  return (await callMail<{ folders: MailFolder[] }>({ action: 'folders' })).folders || []
}

export async function listMail(folderId: string, opts: { start?: number; limit?: number; unread?: boolean } = {}): Promise<MailListItem[]> {
  return (await callMail<{ messages: MailListItem[] }>({ action: 'list', folderId, ...opts })).messages || []
}

export async function searchMail(q: string, opts: { start?: number; limit?: number } = {}): Promise<MailListItem[]> {
  return (await callMail<{ messages: MailListItem[] }>({ action: 'search', q, ...opts })).messages || []
}

export async function getMailMessage(folderId: string, messageId: string): Promise<MailMessageFull> {
  return (await callMail<{ message: MailMessageFull }>({ action: 'message', folderId, messageId })).message
}
