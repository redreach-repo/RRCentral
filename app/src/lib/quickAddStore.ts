import { addActivity, createAccount, logAccountEvent } from './accountsStore'
import { logActivity } from './activity'
import { db } from './db'
import { isMissingRelationError } from './errors'
import { quickLeadNote, type QuickLeadPipeline, type QuickMatch } from './quickAdd'
import type { Account, AccountContact, CrmEntry } from './types'

type Author = { appUserId: string | null; email: string; name?: string }

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

export type QuickData = {
  contacts: Pick<AccountContact, 'id' | 'account_id' | 'name' | 'phone' | 'whatsapp' | 'email'>[]
  accounts: Pick<Account, 'id' | 'name' | 'type' | 'reference'>[]
  crm: Pick<CrmEntry, 'id' | 'company_name' | 'primary_contact' | 'mobile_number' | 'office_number' | 'pipeline_stage' | 'notes'>[]
  countryCode: string
}

/** Loaded once when Quick add opens, so matching as you type is instant. */
export async function loadQuickData(): Promise<QuickData> {
  const [contacts, accounts, crm, settings] = await Promise.all([
    rows<QuickData['contacts'][number]>(db.from('account_contacts').select('id, account_id, name, phone, whatsapp, email')),
    rows<QuickData['accounts'][number]>(db.from('accounts').select('id, name, type, reference')),
    rows<QuickData['crm'][number]>(db.from('crm').select('id, company_name, primary_contact, mobile_number, office_number, pipeline_stage, notes')).catch(() => []),
    rows<{ key: string; value: string }>(db.from('app_settings').select('key, value').eq('key', 'whatsappCountryCode')),
  ])
  return { contacts, accounts, crm, countryCode: settings[0]?.value || '971' }
}

/** Logs a call on the match's timeline; an open AI CRM deal counts it as a touch. */
export async function logQuickCall(match: QuickMatch, body: string, author: Author): Promise<void> {
  const now = new Date().toISOString()
  if (match.kind === 'contact') {
    await addActivity(match.accountId, 'call', `Call with ${match.name || 'the contact'}: ${body}`, author)
    const open = await rows<{ id: string }>(
      db.from('sales_deals').select('id').eq('account_id', match.accountId).not('stage', 'in', '(signed,lost)'),
    ).catch(() => [])
    for (const d of open) await db.from('sales_deals').update({ last_touch_at: now, updated_at: now }).eq('id', d.id)
    return
  }
  const { data } = await db.from('crm').select('notes').eq('id', match.id).maybeSingle()
  const notes = String((data as { notes?: string } | null)?.notes || '')
  const line = `${now.slice(0, 10)} call: ${body}`
  const { error } = await db
    .from('crm')
    .update({ notes: [line, notes].filter(Boolean).join('\n').slice(0, 20000), updated_at: now, updated_by: author.email })
    .eq('id', match.id)
  if (error) throw error
  await logActivity('call_logged', 'crm', match.company, body, author.email, match.id)
}

export type QuickLead = {
  pipeline: QuickLeadPipeline
  phone: string
  name: string
  company: string
  email: string
  source: string
  note: string
}

/** A new lead: an AI CRM prospect with a deal at Lead, or a CRM lead. Returns where to open it. */
export async function saveQuickLead(lead: QuickLead, knownRefs: string[], author: Author): Promise<{ path: string }> {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const note = quickLeadNote(lead.source, lead.note)
  const company = lead.company.trim() || lead.name.trim()
  if (lead.pipeline === 'ai_crm') {
    const account = await createAccount(
      {
        type: 'ai_crm_client',
        name: company,
        industry: '',
        country: '',
        city: '',
        website: '',
        status: 'prospect',
        owner_user_id: author.appUserId,
        source: lead.source,
        notes: note,
      },
      author.email,
      knownRefs,
    )
    const { error: cErr } = await db.from('account_contacts').insert({
      id: crypto.randomUUID(),
      account_id: account.id,
      name: lead.name.trim(),
      role: '',
      email: lead.email.trim(),
      phone: lead.phone,
      whatsapp: lead.phone,
      is_primary: true,
      created_at: now,
    })
    if (cErr) throw cErr
    const { error: dErr } = await db.from('sales_deals').insert({
      id: crypto.randomUUID(),
      account_id: account.id,
      stage: 'lead',
      source: lead.source,
      owner_user_id: author.appUserId,
      next_action: 'Follow up the call',
      next_action_date: today,
      notes: note,
      created_by: author.email,
      last_touch_at: now,
      created_at: now,
      updated_at: now,
    })
    if (dErr) throw dErr
    await logAccountEvent(account.id, `${note.split('\n')[0]}, added by ${author.email}`, author)
    return { path: `/accounts/${account.id}` }
  }
  const id = crypto.randomUUID()
  const { error } = await db.from('crm').insert({
    id,
    company_name: company,
    primary_contact: lead.name.trim(),
    email_phone: lead.email.trim(),
    mobile_number: lead.phone,
    office_number: '',
    notes: note,
    follow_up_date: today,
    next_action: 'Follow up the call',
    owner: author.name || '',
    company_owner: '',
    address: '',
    website: '',
    trn: '',
    pipeline_stage: 'Lead',
    quote_ref: '',
    outcome_reason: '',
    calendar_event_id: '',
    contacts: [{ id: crypto.randomUUID(), name: lead.name.trim(), email: lead.email.trim(), phone: lead.phone, role: 'Primary' }],
    created_by: author.email,
    updated_by: author.email,
    created_at: now,
    updated_at: now,
  })
  if (error) throw error
  await logActivity('create', 'crm', company, 'Quick add lead', author.email, id)
  return { path: '/crm' }
}
