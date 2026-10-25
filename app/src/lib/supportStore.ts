import { currentAuthMode, db } from './db'
import { isCtrmIssue, vendorStatusLabel } from './ctrmIssues'
import { isMissingRelationError } from './errors'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { logAccountEvent } from './accountsStore'
import { currentContract, listContracts, listPackages } from './deliveryStore'
import { DEFAULT_ACCOUNT_TYPE_HOURS, addWorkingHours, slaHoursFor, type WorkingCalendar } from './sla'
import type { AccountType, SlaPolicy, Ticket, TicketChannel, TicketMessage, TicketPriority } from './types'

type Author = { appUserId: string | null; email: string }

/** Marks the opening message a team member typed in for the client. */
export const LOGGED_FOR_CLIENT = ', logged for the client'

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

/** Hours a package's support promise works out to: working days of 9 hours, same day is 4. */
export function packagePolicyHours(supportResponseDays: number): number {
  return supportResponseDays > 0 ? supportResponseDays * 9 : 4
}

let seedingPolicies: Promise<void> | null = null

/** SLA policies, seeded in local mode the first time they are read (the migration seeds the cloud). */
export async function listPolicies(): Promise<SlaPolicy[]> {
  if (seedingPolicies) await seedingPolicies
  const list = await rows<SlaPolicy>(db.from('sla_policies').select('*'))
  if (list.length || currentAuthMode() !== 'local') return list
  // Several screens read the policies at once; seed them only once.
  seedingPolicies ??= seedPolicies().finally(() => {
    seedingPolicies = null
  })
  await seedingPolicies
  return rows<SlaPolicy>(db.from('sla_policies').select('*'))
}

async function seedPolicies(): Promise<void> {
  if ((await rows<SlaPolicy>(db.from('sla_policies').select('id'))).length) return
  const now = new Date().toISOString()
  const packages = await listPackages()
  const seed = [
    ...packages.map((p) => ({
      id: crypto.randomUUID(),
      applies_to: 'package',
      package_id: p.id,
      account_type: null,
      label: `${p.name} package`,
      first_response_hours: packagePolicyHours(Number(p.support_response_days)),
      updated_at: now,
    })),
    ...(
      [
        ['worship_church', 'WorshipHub churches'],
        ['ai_crm_client', 'AI CRM clients without a contract'],
        ['ctrm_prospect', 'CTRM prospects'],
      ] as const
    ).map(([t, label]) => ({
      id: crypto.randomUUID(),
      applies_to: 'account_type',
      package_id: null,
      account_type: t,
      label,
      first_response_hours: DEFAULT_ACCOUNT_TYPE_HOURS,
      updated_at: now,
    })),
  ]
  check(await db.from('sla_policies').insert(seed))
}

export async function savePolicy(
  id: string | null,
  input: Pick<SlaPolicy, 'applies_to' | 'package_id' | 'account_type' | 'label' | 'first_response_hours'>,
): Promise<void> {
  const now = new Date().toISOString()
  if (id) {
    check(await db.from('sla_policies').update({ ...input, updated_at: now }).eq('id', id))
    return
  }
  check(await db.from('sla_policies').insert({ ...input, id: crypto.randomUUID(), updated_at: now }))
}

export async function listTickets(accountId?: string): Promise<Ticket[]> {
  let q = db.from('tickets').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  return rows<Ticket>(q.order('created_at', { ascending: false }))
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const list = await rows<Ticket>(db.from('tickets').select('*').eq('id', id))
  return list[0] ?? null
}

export async function listMessages(ticketId: string): Promise<TicketMessage[]> {
  const list = await rows<TicketMessage>(db.from('ticket_messages').select('*').eq('ticket_id', ticketId))
  return [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}

export type NewTicket = {
  accountId: string
  accountType: AccountType
  /** The client's current package, for the package SLA. */
  packageId: string | null
  contactId: string | null
  subject: string
  details: string
  channel: TicketChannel
  priority: TicketPriority
  assigneeUserId: string | null
}

/** Opens a ticket with its SLA clock set from the account's policy and the working week. */
export async function createTicket(
  input: NewTicket,
  policies: SlaPolicy[],
  calendar: WorkingCalendar,
  author: Author,
): Promise<string> {
  const now = new Date()
  const id = crypto.randomUUID()
  const slaHours = slaHoursFor(input.accountType, input.packageId, policies)
  check(
    await db.from('tickets').insert({
      id,
      account_id: input.accountId,
      contact_id: input.contactId,
      requester_email: '',
      subject: input.subject,
      channel: input.channel,
      priority: input.priority,
      status: 'new',
      assignee_user_id: input.assigneeUserId,
      sla_hours: slaHours,
      sla_due_at: addWorkingHours(now, slaHours, calendar).toISOString(),
      first_response_at: null,
      resolved_at: null,
      ...(input.channel === 'ctrm_next' ? { vendor_status: 'not_raised' } : {}),
      created_by: author.email,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }),
  )
  if (input.details.trim()) {
    check(
      await db.from('ticket_messages').insert({
        id: crypto.randomUUID(),
        ticket_id: id,
        author_kind: 'user',
        author_user_id: author.appUserId,
        author_label: `${author.email}${LOGGED_FOR_CLIENT}`,
        body: input.details.trim(),
        is_internal_note: false,
        external_id: '',
        created_at: now.toISOString(),
      }),
    )
  }
  await logAccountEvent(input.accountId, `Ticket opened: ${input.subject}`, author)
  return id
}

export type TicketPatch = Partial<
  Pick<Ticket, 'status' | 'priority' | 'assignee_user_id' | 'account_id' | 'contact_id' | 'vendor_ticket_ref' | 'vendor_status' | 'client_updated_at'>
>

export async function updateTicket(ticket: Ticket, patch: TicketPatch, author: Author): Promise<void> {
  const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status) {
    const closing = patch.status === 'resolved' || patch.status === 'closed'
    next.resolved_at = closing ? (ticket.resolved_at ?? new Date().toISOString()) : null
  }
  check(await db.from('tickets').update(next).eq('id', ticket.id))
  const accountId = patch.account_id ?? ticket.account_id
  if (accountId && patch.status === 'resolved' && ticket.status !== 'resolved') {
    await logAccountEvent(accountId, `Ticket resolved: ${ticket.subject}`, author)
  }
  if (accountId && patch.vendor_status !== undefined && patch.vendor_status !== (ticket.vendor_status ?? '')) {
    await logAccountEvent(accountId, `CTRM Next issue "${ticket.subject}": vendor side now ${vendorStatusLabel(patch.vendor_status)}`, author)
  }
}

/**
 * Adds a reply or an internal note. The first reply to the client stops the
 * SLA clock and moves a new ticket to open.
 */
export async function addTicketMessage(
  ticket: Ticket,
  body: string,
  internal: boolean,
  author: Author,
): Promise<void> {
  const now = new Date().toISOString()
  check(
    await db.from('ticket_messages').insert({
      id: crypto.randomUUID(),
      ticket_id: ticket.id,
      author_kind: 'user',
      author_user_id: author.appUserId,
      author_label: author.email,
      body,
      is_internal_note: internal,
      external_id: '',
      created_at: now,
    }),
  )
  if (internal) return
  const patch: Record<string, unknown> = { updated_at: now }
  if (!ticket.first_response_at) patch.first_response_at = now
  if (ticket.status === 'new') patch.status = 'open'
  // A reply to a CTRM Next client counts as the update they are owed.
  if (isCtrmIssue(ticket)) patch.client_updated_at = now
  check(await db.from('tickets').update(patch).eq('id', ticket.id))
  if (ticket.account_id) {
    const excerpt = body.length > 160 ? `${body.slice(0, 157)}...` : body
    await logAccountEvent(ticket.account_id, `Replied on ticket "${ticket.subject}": ${excerpt}`, author)
  }
}

/** The package that sets an AI CRM client's SLA: the one on its current contract. */
export async function slaPackageFor(accountId: string, accountType: AccountType): Promise<string | null> {
  if (accountType !== 'ai_crm_client') return null
  const contract = currentContract(await listContracts(accountId))
  return contract && contract.status !== 'ended' && contract.status !== 'cancelled' ? contract.package_id : null
}

export const WHATSAPP_LOCAL_MODE = 'Sending on WhatsApp works once RR Central is connected to Supabase.'

/** Sends a reply on a WhatsApp ticket through the whatsapp-send function, which also logs it on the ticket. */
export async function sendWhatsAppReply(ticketId: string, body: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error(WHATSAPP_LOCAL_MODE)
  const { error } = await getSupabaseClient().functions.invoke('whatsapp-send', { body: { ticket_id: ticketId, body } })
  if (!error) return
  let message = 'The WhatsApp message was not sent. Please try again.'
  try {
    const res = await (error as { context?: Response }).context?.json()
    if (res?.error) message = String(res.error)
  } catch {
    // keep the plain message
  }
  throw new Error(message)
}
