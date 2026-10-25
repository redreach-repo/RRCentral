import { db } from './db'
import { isMissingRelationError } from './errors'
import { addActivity } from './accountsStore'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { ClientUpdateDraft } from './types'
import {
  draftBody,
  factLines,
  hasNews,
  sendProblem,
  updateCandidates,
  updateFacts,
  updateRecipients,
  updateTimelineText,
  weekStartFor,
  type ClientUpdateChannel,
} from './weeklyUpdates'

export type UpdateContact = { id: string; account_id: string; name: string; email: string; phone: string; whatsapp: string; is_primary: boolean }

export type UpdateQueue = {
  drafts: (ClientUpdateDraft & { accountName: string })[]
  contacts: UpdateContact[]
  missingTable: boolean
}

const CONTACT_COLUMNS = 'id, account_id, name, email, phone, whatsapp, is_primary'

/** One week's update drafts, with the account names and contacts. */
export async function loadUpdateQueue(weekStart: string): Promise<UpdateQueue> {
  const { data, error } = await db.from('client_update_drafts').select('*').eq('week_start', weekStart)
  if (error) {
    if (isMissingRelationError(error)) return { drafts: [], contacts: [], missingTable: true }
    throw error
  }
  const rows = (data || []) as ClientUpdateDraft[]
  const ids = [...new Set(rows.map((r) => r.account_id))]
  if (!ids.length) return { drafts: [], contacts: [], missingTable: false }
  const [{ data: accounts }, { data: contacts }] = await Promise.all([
    db.from('accounts').select('id, name').in('id', ids),
    db.from('account_contacts').select(CONTACT_COLUMNS).in('account_id', ids),
  ])
  const names = new Map(((accounts || []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
  const drafts = rows
    .map((r) => ({ ...r, accountName: names.get(r.account_id) || 'Unknown account' }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName))
  return { drafts, contacts: (contacts || []) as UpdateContact[], missingTable: false }
}

export async function saveUpdateBody(id: string, body: string): Promise<void> {
  const { error } = await db.from('client_update_drafts').update({ body: body.trim() }).eq('id', id)
  if (error) throw error
}

export async function setUpdateSkipped(id: string, skipped: boolean): Promise<void> {
  const { error } = await db.from('client_update_drafts').update({ status: skipped ? 'skipped' : 'draft' }).eq('id', id)
  if (error) throw error
}

export type UpdateCallResult<T> = { ok: true; data: T } | { ok: false; message: string }
export type BuildResult = { week_start: string; drafted: string[]; nothing_to_say: string[]; problems: string[] }

async function callUpdates<T>(body: Record<string, unknown>, fallback: string): Promise<UpdateCallResult<T>> {
  const { data, error } = await getSupabaseClient().functions.invoke('client-updates', { body })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || /Failed to send a request/i.test(String((error as Error).message))) {
      return { ok: false, message: 'The client-updates function is not deployed yet.' }
    }
    try {
      const b = await (error as { context?: Response }).context?.json()
      return { ok: false, message: String(b?.error || fallback) }
    } catch {
      return { ok: false, message: fallback }
    }
  }
  return { ok: true, data: data as T }
}

/** Local mode: the same build as the function, against the browser's own data. */
async function buildLocally(weekStart: string, author: string): Promise<BuildResult> {
  const today = new Date().toISOString().slice(0, 10)
  const [accounts, deals, existing, settings] = await Promise.all([
    db.from('accounts').select('id, name, type, status').eq('type', 'ctrm_prospect'),
    db.from('ctrm_deals').select('account_id, stage, next_action, next_action_date'),
    db.from('client_update_drafts').select('account_id, week_start').eq('week_start', weekStart),
    db.from('app_settings').select('key, value').eq('key', 'companyName'),
  ])
  const todo = updateCandidates({
    accounts: (accounts.data || []) as never[],
    deals: (deals.data || []) as never[],
    existing: (existing.data || []) as never[],
    weekStart,
  })
  const companyName = String(((settings.data || []) as { value: string }[])[0]?.value || 'Red Reach Middle East FZE')
  const out: BuildResult = { week_start: weekStart, drafted: [], nothing_to_say: [], problems: [] }
  if (!todo.length) return out
  const ids = todo.map((a) => a.id)
  const [issues, sessions, contacts] = await Promise.all([
    db.from('tickets').select('*').eq('channel', 'ctrm_next').in('account_id', ids),
    db.from('ctrm_sessions').select('*').in('account_id', ids),
    db.from('account_contacts').select(CONTACT_COLUMNS).in('account_id', ids),
  ])
  for (const account of todo) {
    const facts = updateFacts({
      accountId: account.id,
      issues: (issues.data || []) as never[],
      sessions: (sessions.data || []) as never[],
      deals: (deals.data || []) as never[],
      weekStart,
      today,
    })
    if (!hasNews(facts)) {
      out.nothing_to_say.push(account.name)
      continue
    }
    const to = updateRecipients(((contacts.data || []) as UpdateContact[]).filter((c) => c.account_id === account.id))
    const now = new Date().toISOString()
    const { error } = await db.from('client_update_drafts').insert({
      id: crypto.randomUUID(),
      account_id: account.id,
      week_start: weekStart,
      status: 'draft',
      body: draftBody({ contactName: (to.email || to.whatsapp)?.contact.name || '', facts, companyName }),
      facts: factLines(facts),
      error: to.email || to.whatsapp ? '' : 'No contact with an email address or WhatsApp number yet.',
      created_by: author,
      created_at: now,
      updated_at: now,
      sent_by: '',
      sent_at: null,
      sent_via: '',
      sent_to: '',
    })
    if (error) out.problems.push(`${account.name}: ${error.message}`)
    else out.drafted.push(account.name)
  }
  return out
}

/** Builds any missing drafts for the week now (managers and admins). */
export async function buildUpdateDrafts(weekStart: string, author: string): Promise<UpdateCallResult<BuildResult>> {
  if (!isSupabaseConfigured()) {
    try {
      return { ok: true, data: await buildLocally(weekStartFor(new Date(`${weekStart}T12:00:00`)), author) }
    } catch (e) {
      return { ok: false, message: String((e as Error).message || e) }
    }
  }
  return callUpdates<BuildResult>({ action: 'build', week_start: weekStart }, 'The drafts were not built.')
}

/**
 * Sends one approved update. Only the function sends and marks it sent. For
 * WhatsApp it hands back the number, and the app opens WhatsApp with the text.
 */
export async function sendUpdate(
  draft: ClientUpdateDraft,
  channel: ClientUpdateChannel,
  body: string,
  sentBy: { appUserId: string | null; email: string },
): Promise<UpdateCallResult<{ channel: ClientUpdateChannel; to: string }>> {
  if (isSupabaseConfigured()) {
    return callUpdates({ action: 'send', draft_id: draft.id, channel, body }, 'The update was not sent.')
  }
  // Local mode: nothing leaves the browser. Email cannot go out; WhatsApp opens with the text.
  const problem = sendProblem({ status: draft.status, body, channel })
  if (problem) return { ok: false, message: problem }
  if (channel === 'email') return { ok: false, message: 'Local mode cannot send email. Use WhatsApp, or connect Supabase.' }
  const { data: contacts } = await db.from('account_contacts').select(CONTACT_COLUMNS).eq('account_id', draft.account_id)
  const to = updateRecipients((contacts || []) as UpdateContact[]).whatsapp
  if (!to) return { ok: false, message: 'Not sent. No contact with a WhatsApp number.' }
  const { error } = await db
    .from('client_update_drafts')
    .update({ status: 'sent', body: body.trim(), sent_by: sentBy.email, sent_at: new Date().toISOString(), sent_via: channel, sent_to: to.to })
    .eq('id', draft.id)
  if (error) return { ok: false, message: error.message }
  await addActivity(draft.account_id, 'system', updateTimelineText({ weekStart: draft.week_start, channel, to: to.to, sentBy: sentBy.email }), sentBy)
  return { ok: true, data: { channel, to: to.to } }
}
