// WhatsApp to tickets, outbound: sends a reply typed on a WhatsApp ticket to
// the client's WhatsApp and logs it on the ticket, like Log reply does.
//
// WhatsApp only allows free form replies within 24 hours of the client's last
// message; after that this refuses and says so. Rules:
// app/src/lib/whatsappTickets.ts (bundled).
//
// Secrets: WHATSAPP_PHONE_NUMBER_ID and META_ACCESS_TOKEN (the same ones the
// daily digest uses); META_GRAPH_VERSION is optional.
//
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { WHATSAPP_MAX_TEXT, serviceWindow, textMessagePayload } from "./whatsappTickets.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function corsHeadersFor(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  const allowed = raw ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean) : DEFAULT_ORIGINS
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(withErrorLog("whatsapp-send", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Verify JWT is off for this function, so check the signed in user here,
  // before anything else: no token or a token Auth does not accept is refused.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)

  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || ""
  const token = Deno.env.get("META_ACCESS_TOKEN") || ""
  if (!phoneNumberId || !token) {
    return json({ error: "WhatsApp sending is not set up yet. Add WHATSAPP_PHONE_NUMBER_ID and META_ACCESS_TOKEN in Supabase." }, 503)
  }

  const body = (await req.json().catch(() => ({}))) as { ticket_id?: unknown; body?: unknown }
  const ticketId = typeof body.ticket_id === "string" && UUID.test(body.ticket_id) ? body.ticket_id : ""
  const text = typeof body.body === "string" ? body.body.trim() : ""
  if (!ticketId || !text) return json({ error: "Write a reply first" }, 400)
  if (text.length > WHATSAPP_MAX_TEXT) return json({ error: `WhatsApp replies can be up to ${WHATSAPP_MAX_TEXT} characters` }, 400)

  // May they reply on this ticket? Read it as them, so RLS decides.
  const { data: ticket } = await userDb
    .from("tickets")
    .select("id, account_id, subject, status, channel, requester_phone, first_response_at")
    .eq("id", ticketId)
    .maybeSingle()
  if (!ticket) return json({ error: "Ticket not found" }, 404)
  const { data: allowed } = ticket.account_id
    ? await userDb.rpc("rr_can_write_account", { target: ticket.account_id })
    : await userDb.rpc("rr_is_staff")
  if (allowed !== true) return json({ error: "You cannot reply on this ticket" }, 403)
  if (!ticket.requester_phone) return json({ error: "This ticket has no WhatsApp number to reply to" }, 400)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: lastIn } = await sb
    .from("ticket_messages")
    .select("created_at")
    .eq("ticket_id", ticket.id)
    .eq("author_kind", "contact")
    .like("external_id", "wamid.%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const now = new Date()
  if (!serviceWindow(lastIn?.created_at ?? null, now).open) {
    return json(
      {
        error:
          "It is more than 24 hours since the client last wrote, so WhatsApp will not take a normal reply. Call them, or wait for them to write again.",
      },
      409,
    )
  }

  const version = Deno.env.get("META_GRAPH_VERSION") || "v21.0"
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(textMessagePayload(ticket.requester_phone, text)),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null)
  const out = res ? await res.json().catch(() => ({})) : {}
  const wamid = (out as { messages?: { id?: string }[] }).messages?.[0]?.id || ""
  if (!res || !res.ok || !wamid) {
    const reason = (out as { error?: { message?: string } }).error?.message || "no answer from WhatsApp"
    return json({ error: `WhatsApp did not take the message: ${reason}` }, 502)
  }

  // Log it on the ticket, as Log reply would.
  const { data: me } = await userDb.rpc("rr_current_user_id")
  const iso = now.toISOString()
  const { error: msgErr } = await sb.from("ticket_messages").insert({
    ticket_id: ticket.id,
    author_kind: "user",
    author_user_id: typeof me === "string" ? me : null,
    author_label: who.user.email || "",
    body: text,
    is_internal_note: false,
    external_id: wamid,
    delivery_status: "sent",
    created_at: iso,
  })
  if (msgErr) return json({ error: `Sent, but not logged on the ticket: ${msgErr.message}` }, 500)
  const patch: Record<string, unknown> = { updated_at: iso }
  if (!ticket.first_response_at) patch.first_response_at = iso
  if (ticket.status === "new") patch.status = "open"
  await sb.from("tickets").update(patch).eq("id", ticket.id)
  if (ticket.account_id) {
    const excerpt = text.length > 160 ? `${text.slice(0, 157)}...` : text
    await sb.from("account_activities").insert({
      account_id: ticket.account_id,
      kind: "system",
      body: `Replied on WhatsApp on ticket "${ticket.subject}": ${excerpt}`,
      user_email: who.user.email || "",
    })
  }
  return json({ ok: true, wamid })
}, { secrets: ["WHATSAPP_PHONE_NUMBER_ID", "META_ACCESS_TOKEN"] }))
