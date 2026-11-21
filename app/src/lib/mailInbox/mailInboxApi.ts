/**
 * Calls the mail-inbox Edge Function for the signed in person's OWN mailbox.
 * The Zoho keys and access token stay on the server; this only ever receives
 * folders, email lists and email content.
 */
import { getSupabaseClient, isSupabaseConfigured } from '../supabaseConfig'
import type { ComposeDraft, MailFolder, MailListItem, MailMessageFull } from './mailInbox'

export class MailSetupError extends Error {
  /** Zoho has not yet been asked for the send permission: the person reconnects once. */
  needsSendScope = false
}

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
    if ((detail as { setup?: boolean } | null)?.setup) {
      const err = new MailSetupError(msg || 'Zoho Mail is not connected')
      err.needsSendScope = Boolean((detail as { needsSendScope?: boolean }).needsSendScope)
      throw err
    }
    throw new Error(msg || error.message || 'The mail service did not answer')
  }
  const res = data as T & { error?: string }
  if (res?.error) throw new Error(res.error)
  return res
}

export type MailStatus = {
  /** The admin has added the Zoho app and the token key in Supabase. */
  ready: boolean
  /** This person has connected their own mailbox. */
  connected: boolean
  address: string
  /** The connection includes Zoho's send permission (connected after sending was added). */
  canSend: boolean
}

export async function getMailStatus(): Promise<MailStatus> {
  const res = await callMail<MailStatus>({ action: 'status' })
  return { ready: Boolean(res.ready), connected: Boolean(res.connected), address: String(res.address || ''), canSend: Boolean(res.canSend) }
}

/** Zoho's consent page for this person's own mailbox; Zoho sends them back to `returnTo`. */
export async function startMailConnect(returnTo: string): Promise<string> {
  const res = await callMail<{ url: string }>({ action: 'connect', return_to: returnTo })
  if (!/^https:\/\/accounts\.zoho\./.test(res.url || '')) throw new Error('Zoho did not give a sign in link')
  return res.url
}

export async function disconnectMail(): Promise<void> {
  await callMail<{ ok: boolean }>({ action: 'disconnect' })
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

/** A PDF the page attaches to an email it sends from the person's own mailbox. */
export type MailAttachment = { name: string; base64: string }
/** Files the sent email under a record's email history. */
export type MailLinkTarget = { targetType: 'account' | 'crm' | 'quotation' | 'invoice'; targetId: string }

/**
 * Sends from the person's own address. Call it ONLY from the Send button: the
 * server sends straight away. Reply, reply all and forward quote the original.
 * `attachments` are PDFs only (at most 3, 10 MB). `linkTo` files the sent email
 * under that record; `linked` says whether that worked (the email is sent either way).
 */
export async function sendMail(
  draft: ComposeDraft,
  original?: { folderId: string; messageId: string },
  extras: { attachments?: MailAttachment[]; linkTo?: MailLinkTarget } = {},
): Promise<{ messageId: string; linked: boolean }> {
  const res = await callMail<{ ok: boolean; messageId?: string; linked?: boolean }>({
    action: 'send',
    mode: draft.mode,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    text: draft.text,
    ...(draft.mode !== 'new' && original ? { folderId: original.folderId, messageId: original.messageId } : {}),
    ...(extras.attachments?.length ? { attachments: extras.attachments } : {}),
    ...(extras.linkTo ? { linkTo: extras.linkTo } : {}),
  })
  return { messageId: String(res.messageId || ''), linked: Boolean(res.linked) }
}

/** Blob -> base64 without the data: prefix, for sendMail attachments. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}
