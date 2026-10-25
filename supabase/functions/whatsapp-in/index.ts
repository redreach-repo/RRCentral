// WhatsApp to tickets, inbound: Meta calls this webhook for every message a
// client sends to the WhatsApp Business number, and for delivery updates on
// replies we sent.
//
// A message from a number with an open ticket joins that ticket. Otherwise a
// new ticket opens, filed on the account whose contact has that number (or
// left unfiled for the team to file), with the SLA clock from
// app/src/lib/sla.ts. Parsing and rules: app/src/lib/whatsappTickets.ts
// (bundled).
//
// Secrets: WHATSAPP_VERIFY_TOKEN (any long random text, also typed into
// Meta's webhook setup), WHATSAPP_APP_SECRET (Meta app, Settings, Basic) and,
// optionally, WHATSAPP_PHONE_NUMBER_ID to ignore other numbers on the app.
//
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  addWorkingHours,
  calendarFromSettings,
  nextDeliveryStatus,
  parseWebhook,
  phoneMatches,
  slaHoursFor,
  ticketSubject,
  validSignature,
} from "./whatsappTickets.bundle.js"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const OPEN = ["new", "open", "waiting_on_client"]

type Contact = { id: string; account_id: string; name: string; phone: string; whatsapp: string }

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Meta's one time check when the webhook is saved.
  if (req.method === "GET") {
    const token = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || ""
    if (
      token &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === token
    ) {
      return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 })
    }
    return new Response("Forbidden", { status: 403 })
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  // Fail closed: only Meta, signing with the app secret, can post here.
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET") || ""
  if (!appSecret) return json({ error: "WHATSAPP_APP_SECRET is not set" }, 500)
  const raw = await req.text()
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256") || "", appSecret))) {
    return json({ error: "Unauthorized" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 500)
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  let payload: unknown = null
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ error: "Bad JSON" }, 400)
  }
  const ourNumber = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || ""
  const { messages, statuses } = parseWebhook(payload)

  // Delivery updates on replies we sent.
  for (const s of statuses) {
    const { data: row } = await sb
      .from("ticket_messages")
      .select("id, delivery_status")
      .eq("external_id", s.wamid)
      .maybeSingle()
    const next = row ? nextDeliveryStatus(row.delivery_status || "", s.status) : null
    if (row && next) await sb.from("ticket_messages").update({ delivery_status: next }).eq("id", row.id)
  }

  const inbound = messages.filter((m) => !ourNumber || !m.phoneNumberId || m.phoneNumberId === ourNumber)
  if (!inbound.length) return json({ ok: true, messages: 0, statuses: statuses.length })

  const [{ data: settingRows }, { data: policies }] = await Promise.all([
    sb
      .from("app_settings")
      .select("key, value")
      .in("key", ["supportWorkingDays", "supportDayStart", "supportDayEnd", "whatsappCountryCode"]),
    sb.from("sla_policies").select("applies_to, package_id, account_type, first_response_hours"),
  ])
  const settings = Object.fromEntries((settingRows || []).map((r) => [r.key, r.value])) as Record<string, string>
  const countryCode = settings.whatsappCountryCode || "971"

  let contacts: Contact[] | null = null
  let created = 0
  let added = 0
  for (const m of inbound) {
    const now = new Date()
    const { data: dupe } = await sb.from("ticket_messages").select("id").eq("external_id", m.wamid).maybeSingle()
    if (dupe) continue

    // Who is it? Match the number to a contact on file. Numbers are saved in
    // many formats (050 123 4567, +971...), so compare them normalised.
    if (!contacts) {
      const { data } = await sb
        .from("account_contacts")
        .select("id, account_id, name, phone, whatsapp")
        .or("whatsapp.neq.,phone.neq.")
        .limit(10000)
      contacts = (data || []) as Contact[]
    }
    const contact =
      contacts.find(
        (c) => phoneMatches(c.whatsapp, m.from, countryCode) || phoneMatches(c.phone, m.from, countryCode),
      ) ?? null
    const who = contact?.name || m.name || `+${m.from}`
    const label = `${who} (WhatsApp +${m.from})`

    // An open ticket from this number gets the message.
    const { data: openTicket } = await sb
      .from("tickets")
      .select("id, status")
      .eq("requester_phone", m.from)
      .in("status", OPEN)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    let ticketId = openTicket?.id as string | undefined
    if (ticketId) {
      if (openTicket?.status === "waiting_on_client") {
        await sb.from("tickets").update({ status: "open", updated_at: now.toISOString() }).eq("id", ticketId)
      }
    } else {
      let accountType: string | null = null
      let packageId: string | null = null
      if (contact?.account_id) {
        const { data: account } = await sb.from("accounts").select("type").eq("id", contact.account_id).maybeSingle()
        accountType = account?.type ?? null
        if (accountType === "ai_crm_client") {
          const { data: contracts } = await sb
            .from("contracts")
            .select("package_id, status, created_at")
            .eq("account_id", contact.account_id)
            .order("created_at", { ascending: false })
          const current = (contracts || []).find((c) => c.status === "active") ?? (contracts || [])[0]
          if (current && current.status !== "ended" && current.status !== "cancelled") packageId = current.package_id
        }
      }
      const slaHours = slaHoursFor(accountType, packageId, policies || [])
      const { data: ticket, error } = await sb
        .from("tickets")
        .insert({
          account_id: contact?.account_id ?? null,
          contact_id: contact?.id ?? null,
          requester_email: "",
          requester_phone: m.from,
          subject: ticketSubject(m.body),
          channel: "whatsapp",
          priority: "normal",
          status: "new",
          sla_hours: slaHours,
          sla_due_at: addWorkingHours(now, slaHours, calendarFromSettings(settings)).toISOString(),
          created_by: "WhatsApp in",
        })
        .select("id")
        .single()
      if (error || !ticket) return json({ error: error?.message || "Could not create ticket" }, 500)
      ticketId = ticket.id
      created++
      if (contact?.account_id) {
        await sb.from("account_activities").insert({
          account_id: contact.account_id,
          kind: "system",
          body: `Ticket opened on WhatsApp: ${ticketSubject(m.body)}`,
          user_email: "WhatsApp in",
        })
      }
    }

    const { error: msgErr } = await sb.from("ticket_messages").insert({
      ticket_id: ticketId,
      author_kind: "contact",
      author_label: label,
      body: m.body,
      external_id: m.wamid,
      created_at: m.sentAt,
    })
    // 23505: the same message arrived twice at once; the first copy is saved.
    if (msgErr && msgErr.code !== "23505") return json({ error: msgErr.message }, 500)
    if (!msgErr) {
      added++
      await sb.from("tickets").update({ updated_at: now.toISOString() }).eq("id", ticketId)
    }
  }

  return json({ ok: true, created, added, statuses: statuses.length })
})
