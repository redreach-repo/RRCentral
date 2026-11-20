/**
 * Mail step 2: emails linked to a client (account), CRM company or deal,
 * quotation or invoice. Only the header is stored (mail_links); the body stays
 * in the mailbox of the person who linked it, so only they can open it.
 */
import { db } from '../db'
import { isMissingRelationError } from '../errors'
import { getSupabaseClient } from '../supabaseConfig'

export type MailLinkType = 'account' | 'crm' | 'quotation' | 'invoice'

export const MAIL_LINK_TYPES: { id: MailLinkType; label: string }[] = [
  { id: 'account', label: 'Client' },
  { id: 'crm', label: 'CRM company / deal' },
  { id: 'quotation', label: 'Quotation' },
  { id: 'invoice', label: 'Invoice' },
]

export type MailLink = {
  id: string
  target_type: MailLinkType
  target_id: string
  mailbox_owner: string
  message_id: string
  folder_id: string
  subject: string
  from_address: string
  to_address: string
  sent_at: string | null
  has_attachment: boolean
  linked_by: string
  created_at: string
}

export type LinkTarget = { type: MailLinkType; id: string; label: string; detail: string }

const COLUMNS =
  'id, target_type, target_id, mailbox_owner, message_id, folder_id, subject, from_address, to_address, sent_at, has_attachment, linked_by, created_at'

export class MailLinksMissing extends Error {}

function check(error: unknown) {
  if (!error) return
  if (isMissingRelationError(error)) throw new MailLinksMissing('Linking emails is not set up yet (mail_links SQL).')
  throw error instanceof Error ? error : new Error((error as { message?: string }).message || 'Could not load linked emails')
}

/** Links on one email in the signed in person's mailbox. */
export async function linksForMessage(owner: string, messageId: string): Promise<MailLink[]> {
  const { data, error } = await db
    .from('mail_links')
    .select(COLUMNS)
    .eq('mailbox_owner', owner.toLowerCase())
    .eq('message_id', messageId)
  check(error)
  return (data as MailLink[]) || []
}

/** Email history for a record: every email linked to any of these targets, newest first, one row per email. */
export async function linksForTargets(targets: { type: MailLinkType; id: string }[]): Promise<MailLink[]> {
  const out: MailLink[] = []
  for (const type of new Set(targets.map((t) => t.type))) {
    const ids = targets.filter((t) => t.type === type).map((t) => t.id)
    if (!ids.length) continue
    const { data, error } = await db.from('mail_links').select(COLUMNS).eq('target_type', type).in('target_id', ids)
    check(error)
    out.push(...((data as MailLink[]) || []))
  }
  return dedupeHistory(out)
}

/** One row per email (the same email can be linked to the client and its CRM entry), newest first. */
export function dedupeHistory(links: MailLink[]): MailLink[] {
  const seen = new Map<string, MailLink>()
  for (const l of links) {
    const key = `${l.mailbox_owner}:${l.message_id}`
    if (!seen.has(key)) seen.set(key, l)
  }
  return [...seen.values()].sort((a, b) => (b.sent_at || b.created_at).localeCompare(a.sent_at || a.created_at))
}

export async function linkMail(input: { folderId: string; messageId: string; targetType: MailLinkType; targetId: string }): Promise<void> {
  const { data, error } = await getSupabaseClient().functions.invoke('mail-inbox', { body: { action: 'link', ...input } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    throw new Error((detail as { error?: string } | null)?.error || error.message || 'Could not link the email')
  }
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error)
}

export async function unlinkMail(id: string): Promise<void> {
  const { error, count } = await db.from('mail_links').delete({ count: 'exact' }).eq('id', id)
  check(error)
  if (count === 0) throw new Error('Only the person who linked it, a manager or an admin can unlink this email')
}

/** Like-pattern text: no wildcards from the user. */
export function likeText(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, '\\$&').slice(0, 80)}%`
}

/** Records to link an email to, by name or reference. */
export async function searchLinkTargets(type: MailLinkType, q: string): Promise<LinkTarget[]> {
  const like = likeText(q)
  if (type === 'account') {
    const { data, error } = await db.from('accounts').select('id, name, type').ilike('name', like).order('name').limit(20)
    check(error)
    return ((data as { id: string; name: string; type: string }[]) || []).map((r) => ({
      type,
      id: r.id,
      label: r.name,
      detail: r.type === 'ai_crm_client' ? 'AI CRM client' : r.type === 'worship_church' ? 'WorshipHub church' : 'CTRM Next',
    }))
  }
  if (type === 'crm') {
    const { data, error } = await db.from('crm').select('id, company_name, pipeline_stage').ilike('company_name', like).order('company_name').limit(20)
    check(error)
    return ((data as { id: string; company_name: string; pipeline_stage: string }[]) || []).map((r) => ({
      type,
      id: r.id,
      label: r.company_name,
      detail: r.pipeline_stage || '',
    }))
  }
  const table = type === 'quotation' ? 'quotations' : 'invoices'
  type DocRow = { id: string; reference_number: string; client: string; date: string | null }
  const [byRef, byClient] = await Promise.all(
    (['reference_number', 'client'] as const).map((col) =>
      db.from(table).select('id, reference_number, client, date').ilike(col, like).order('date', { ascending: false }).limit(20),
    ),
  )
  check(byRef.error)
  check(byClient.error)
  const rows = new Map<string, DocRow>()
  for (const r of [...((byRef.data as DocRow[]) || []), ...((byClient.data as DocRow[]) || [])]) rows.set(r.id, r)
  return [...rows.values()]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 20)
    .map((r) => ({
      type,
      id: r.id,
      label: r.reference_number || '(no number)',
      detail: [r.client, r.date].filter(Boolean).join(' · '),
    }))
}

/** Label for a link chip, e.g. "Quotation". */
export function linkTypeLabel(type: MailLinkType): string {
  return MAIL_LINK_TYPES.find((t) => t.id === type)?.label.split(' /')[0] || type
}

/** Names for link chips: client name, CRM company, or quotation / invoice number. */
export async function targetLabels(links: Pick<MailLink, 'target_type' | 'target_id'>[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const by = (t: MailLinkType) => [...new Set(links.filter((l) => l.target_type === t).map((l) => l.target_id))]
  const jobs: Promise<void>[] = []
  const fetch = (t: MailLinkType, table: string, col: string) => {
    const ids = by(t)
    if (!ids.length) return
    jobs.push(
      (async () => {
        const { data } = await db.from(table).select(`id, ${col}`).in('id', ids)
        for (const r of (data as Record<string, string>[]) || []) out.set(`${t}:${r.id}`, r[col] || '(no name)')
      })(),
    )
  }
  fetch('account', 'accounts', 'name')
  fetch('crm', 'crm', 'company_name')
  fetch('quotation', 'quotations', 'reference_number')
  fetch('invoice', 'invoices', 'reference_number')
  await Promise.all(jobs)
  return out
}

/** Where a link chip goes in the app. */
export function targetHref(l: Pick<MailLink, 'target_type' | 'target_id'>): string {
  const id = encodeURIComponent(l.target_id)
  if (l.target_type === 'account') return `/accounts/${id}`
  if (l.target_type === 'crm') return `/crm?edit=${id}`
  return `/document/${l.target_type === 'quotation' ? 'quote' : 'invoice'}/${id}`
}
