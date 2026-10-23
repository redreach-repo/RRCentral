// Turns email sent to the shared support address into support desk tickets.
//
// Any inbound email service can call this (Postmark, Mailgun, SendGrid,
// Cloudflare Email Workers...). See README.md in this folder for setup.
// Deploy with Verify JWT OFF; the shared SUPPORT_INBOUND_SECRET protects it.
//
// A reply to an earlier message (In-Reply-To / References) is added to that
// ticket. Otherwise the sender's email is matched to an account contact and a
// new ticket opens with its SLA clock from app/src/lib/sla.ts (bundled).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { addWorkingHours, calendarFromSettings, slaHoursFor } from './sla.bundle.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Inbound = {
  from: string
  fromName: string
  subject: string
  text: string
  messageId: string
  inReplyTo: string[]
}

/** Accepts the simple shape in README.md, or Postmark's inbound JSON as is. */
function normalise(raw: Record<string, unknown>): Inbound | null {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const headers = Array.isArray(raw.Headers) ? (raw.Headers as { Name?: string; Value?: string }[]) : []
  const header = (name: string) => headers.find((h) => h.Name?.toLowerCase() === name)?.Value || ''
  const fromRaw = str(raw.from) || str(raw.From)
  const email = (/<([^>]+)>/.exec(fromRaw)?.[1] || fromRaw).trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  const ids = [str(raw.inReplyTo), str(raw.references), header('in-reply-to'), header('references')]
    .join(' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    from: email.slice(0, 320),
    fromName: (str(raw.fromName) || str(raw.FromName)).slice(0, 200),
    subject: (str(raw.subject) || str(raw.Subject) || '(no subject)').slice(0, 300),
    text: (str(raw.text) || str(raw.TextBody) || str(raw.StrippedTextReply)).slice(0, 20000),
    messageId: (str(raw.messageId) || str(raw.MessageID) || header('message-id')).slice(0, 500),
    inReplyTo: ids,
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Fail closed: without a configured secret nobody can post tickets.
  const expected = Deno.env.get('SUPPORT_INBOUND_SECRET') || ''
  // Header for services that can set one; HTTP Basic auth (password = secret) for those that cannot.
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get('authorization') || '')?.[1]
  let basicPassword = ''
  try {
    basicPassword = basic ? atob(basic).split(':').slice(1).join(':') : ''
  } catch {
    basicPassword = ''
  }
  const provided = req.headers.get('x-support-secret') || basicPassword
  if (!expected) return json({ error: 'SUPPORT_INBOUND_SECRET is not set' }, 500)
  if (provided !== expected) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'Server misconfigured' }, 500)

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const mail = raw ? normalise(raw) : null
  if (!mail) return json({ error: 'Missing sender email' }, 400)

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const now = new Date()

  // Same email delivered twice: do nothing.
  if (mail.messageId) {
    const { data: dupe } = await sb
      .from('ticket_messages')
      .select('id')
      .eq('external_id', mail.messageId)
      .limit(1)
      .maybeSingle()
    if (dupe) return json({ ok: true, duplicate: true })
  }

  const { data: contact } = await sb
    .from('account_contacts')
    .select('id, account_id, name')
    .ilike('email', mail.from)
    .limit(1)
    .maybeSingle()
  const label = contact?.name ? `${contact.name} <${mail.from}>` : mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from

  // A reply on an existing thread goes onto that ticket.
  if (mail.inReplyTo.length) {
    const { data: prior } = await sb
      .from('ticket_messages')
      .select('ticket_id')
      .in('external_id', mail.inReplyTo)
      .limit(1)
      .maybeSingle()
    if (prior?.ticket_id) {
      const { error } = await sb.from('ticket_messages').insert({
        ticket_id: prior.ticket_id,
        author_kind: 'contact',
        author_label: label,
        body: mail.text,
        external_id: mail.messageId,
      })
      if (error) return json({ error: error.message }, 500)
      const { data: t } = await sb.from('tickets').select('status').eq('id', prior.ticket_id).maybeSingle()
      if (t && t.status !== 'new' && t.status !== 'open') {
        await sb.from('tickets').update({ status: 'open', resolved_at: null, updated_at: now.toISOString() }).eq('id', prior.ticket_id)
      }
      return json({ ok: true, ticket_id: prior.ticket_id, threaded: true })
    }
  }

  // New ticket. Work out the SLA from the account's package or type.
  let accountType: string | null = null
  let packageId: string | null = null
  if (contact?.account_id) {
    const { data: account } = await sb.from('accounts').select('type').eq('id', contact.account_id).maybeSingle()
    accountType = account?.type ?? null
    if (accountType === 'ai_crm_client') {
      const { data: contracts } = await sb
        .from('contracts')
        .select('package_id, status, created_at')
        .eq('account_id', contact.account_id)
        .order('created_at', { ascending: false })
      const current = (contracts || []).find((c) => c.status === 'active') ?? (contracts || [])[0]
      if (current && current.status !== 'ended' && current.status !== 'cancelled') packageId = current.package_id
    }
  }
  const [{ data: policies }, { data: settingRows }] = await Promise.all([
    sb.from('sla_policies').select('applies_to, package_id, account_type, first_response_hours'),
    sb.from('app_settings').select('key, value').in('key', ['supportWorkingDays', 'supportDayStart', 'supportDayEnd']),
  ])
  const settings = Object.fromEntries((settingRows || []).map((r) => [r.key, r.value]))
  const slaHours = slaHoursFor(accountType, packageId, policies || [])
  const due = addWorkingHours(now, slaHours, calendarFromSettings(settings))

  const { data: ticket, error: ticketErr } = await sb
    .from('tickets')
    .insert({
      account_id: contact?.account_id ?? null,
      contact_id: contact?.id ?? null,
      requester_email: mail.from,
      subject: mail.subject,
      channel: 'email',
      priority: 'normal',
      status: 'new',
      sla_hours: slaHours,
      sla_due_at: due.toISOString(),
      created_by: 'Email in',
    })
    .select('id')
    .single()
  if (ticketErr || !ticket) return json({ error: ticketErr?.message || 'Could not create ticket' }, 500)

  const { error: msgErr } = await sb.from('ticket_messages').insert({
    ticket_id: ticket.id,
    author_kind: 'contact',
    author_label: label,
    body: mail.text,
    external_id: mail.messageId,
  })
  if (msgErr) return json({ error: msgErr.message }, 500)

  if (contact?.account_id) {
    await sb.from('account_activities').insert({
      account_id: contact.account_id,
      kind: 'email',
      body: `Ticket opened by email: ${mail.subject}`,
      user_email: 'Email in',
    })
  }

  return json({ ok: true, ticket_id: ticket.id, matched: Boolean(contact) })
})
