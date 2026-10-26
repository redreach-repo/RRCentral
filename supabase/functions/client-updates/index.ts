// Weekly CTRM Next client updates: every Thursday, draft one short update per
// CTRM Next client with a signed deal (issues fixed this week, issues still
// open, the next session or milestone) into the Approve queue (Accounts >
// Weekly updates). Nothing is sent from the schedule. A person checks the
// wording and taps Send by email or Send by WhatsApp; only then does this
// email it (Zoho Mail), or mark it sent and hand back the WhatsApp number so
// the app opens WhatsApp with the text typed in. Every send is logged on the
// account timeline.
//
//   POST {}                                     build drafts (schedule or manager)
//   POST { action: "build", week_start? }       the same, by hand, for a week
//   POST { action: "send", draft_id, channel: "email" | "whatsapp", body }
//
// Who may call:
//  * build: header x-cron-secret = CLIENT_UPDATE_CRON_SECRET, or a signed in
//    manager or admin.
//  * send: a signed in admin, manager or sales person who can edit the account.
//
// The facts and wording are in app/src/lib/weeklyUpdates.ts (bundled). Each
// client gets one draft per week (unique key), so running twice adds nothing.
// Relationship facts only: never trades, positions or prices, and nothing is
// read from or sent to CTRM Next's own systems.
//
// Secret: CLIENT_UPDATE_CRON_SECRET. Email uses the Zoho Mail connection.
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).
// Steps: docs/client-updates.md.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  draftBody,
  factLines,
  hasNews,
  sendProblem,
  updateCandidates,
  updateEmail,
  updateFacts,
  updateRecipients,
  updateTimelineText,
  weekStartFor,
} from "./weeklyUpdates.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { zohoMailer } from "../_shared/zohoMail.ts"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
]

function corsHeadersFor(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  const allowed = raw ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean) : DEFAULT_ORIGINS
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RUN_BY = "RR Central weekly updates"

/** Now, shifted so that its UTC date is Dubai's (UTC+4, no daylight saving). */
function dubaiToday(): Date {
  return new Date(Date.now() + 4 * 60 * 60 * 1000)
}

type Contact = { id: string; account_id: string; name: string; email: string; phone: string; whatsapp: string; is_primary: boolean }

Deno.serve(withErrorLog("client-updates", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = body.action === "send" ? "send" : "build"

  // Who is calling: the schedule (shared secret) or a signed in user.
  const cronSecret = Deno.env.get("CLIENT_UPDATE_CRON_SECRET") || ""
  const providedSecret = req.headers.get("x-cron-secret") || ""
  let runBy = RUN_BY
  // deno-lint-ignore no-explicit-any
  let userDb: any = null
  if (providedSecret) {
    if (!cronSecret || providedSecret !== cronSecret) return json({ error: "Unauthorized" }, 401)
    if (action !== "build") return json({ error: "The schedule only builds drafts" }, 403)
  } else {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
    if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
    userDb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: who } = await userDb.auth.getUser(jwt)
    if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
    runBy = who.user.email || RUN_BY
    if (action === "build") {
      const { data: allowed } = await userDb.rpc("rr_is_manager_or_admin")
      if (allowed !== true) return json({ error: "Only managers and admins can build the weekly updates" }, 403)
    } else {
      const { data: allowed } = await userDb.rpc("rr_is_staff")
      if (allowed !== true) return json({ error: "Only admins, managers and sales can send updates to clients" }, 403)
    }
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: settingRows } = await sb.from("app_settings").select("key, value").in("key", ["companyName", "whatsappCountryCode"])
  const settings: Record<string, string> = {}
  for (const r of (settingRows || []) as { key: string; value: string }[]) settings[r.key] = String(r.value ?? "")
  const companyName = settings.companyName || "Red Reach Middle East FZE"
  const countryCode = settings.whatsappCountryCode || "971"

  // ---- Build the week's drafts ----
  if (action === "build") {
    const now = dubaiToday()
    const asked = typeof body.week_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start) ? body.week_start : ""
    const weekStart = asked ? weekStartFor(new Date(`${asked}T12:00:00Z`)) : weekStartFor(now)
    const today = now.toISOString().slice(0, 10)
    const [accounts, deals, existing] = await Promise.all([
      sb.from("accounts").select("id, name, type, status").eq("type", "ctrm_prospect"),
      sb.from("ctrm_deals").select("account_id, stage, next_action, next_action_date"),
      sb.from("client_update_drafts").select("account_id, week_start").eq("week_start", weekStart),
    ])
    if (existing.error) return json({ error: "Run the weekly updates SQL first (client_update_drafts is missing)." }, 503)
    const failed = [accounts, deals].find((r) => r.error)
    if (failed?.error) throw new Error(`Could not load the CTRM Next clients: ${failed.error.message}`)
    const todo = updateCandidates({
      accounts: (accounts.data || []) as never[],
      deals: (deals.data || []) as never[],
      existing: (existing.data || []) as never[],
      weekStart,
    }) as { id: string; name: string }[]
    if (!todo.length) return json({ week_start: weekStart, drafted: [], nothing_to_say: [], problems: [] })

    const ids = todo.map((a) => a.id)
    const [issues, sessions, contacts] = await Promise.all([
      sb.from("tickets")
        .select("account_id, subject, status, channel, vendor_status, vendor_ticket_ref, vendor_fixed_at, resolved_at")
        .eq("channel", "ctrm_next")
        .in("account_id", ids)
        .limit(5000),
      sb.from("ctrm_sessions").select("account_id, kind, session_date, topics_left").in("account_id", ids).gte("session_date", today),
      sb.from("account_contacts").select("id, account_id, name, email, phone, whatsapp, is_primary").in("account_id", ids),
    ])
    const loadErr = [issues, sessions, contacts].find((r) => r.error)
    if (loadErr?.error) throw new Error(`Could not load the issues and sessions: ${loadErr.error.message}`)

    const made: string[] = []
    const quiet: string[] = []
    const problems: string[] = []
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
        quiet.push(account.name)
        continue
      }
      const mine = ((contacts.data || []) as Contact[]).filter((c) => c.account_id === account.id)
      const to = updateRecipients(mine, countryCode) as { email: { contact: Contact } | null; whatsapp: { contact: Contact } | null }
      const contactName = (to.email || to.whatsapp)?.contact.name || ""
      const { error: insErr } = await sb.from("client_update_drafts").insert({
        account_id: account.id,
        week_start: weekStart,
        body: draftBody({ contactName, facts, companyName }),
        facts: factLines(facts),
        error: to.email || to.whatsapp ? "" : "No contact with an email address or WhatsApp number yet.",
        created_by: runBy,
      })
      if (insErr && insErr.code !== "23505") problems.push(`${account.name}: ${insErr.message.slice(0, 200)}`)
      else if (!insErr) made.push(account.name)
    }
    if (problems.length && !made.length) throw new Error(`No update drafts were made. ${problems.join("; ")}`)
    return json({ week_start: weekStart, drafted: made, nothing_to_say: quiet, problems })
  }

  // ---- Send one approved draft ----
  const draftId = typeof body.draft_id === "string" && UUID.test(body.draft_id) ? body.draft_id : ""
  if (!draftId) return json({ error: "Which update?" }, 400)
  const channel = body.channel === "whatsapp" ? "whatsapp" : body.channel === "email" ? "email" : ""
  const text = typeof body.body === "string" ? body.body.trim() : ""

  const { data: draft } = await sb.from("client_update_drafts").select("*").eq("id", draftId).maybeSingle()
  if (!draft) return json({ error: "That update draft was not found" }, 404)
  const { data: canEdit } = await userDb.rpc("rr_can_write_account", { target: draft.account_id })
  if (canEdit !== true) return json({ error: "You can only send updates for accounts you can edit" }, 403)
  const problem = sendProblem({ status: draft.status, body: text, channel })
  if (problem) return json({ error: problem }, 409)

  const [{ data: account }, { data: contacts }] = await Promise.all([
    sb.from("accounts").select("id, name").eq("id", draft.account_id).maybeSingle(),
    sb.from("account_contacts").select("id, account_id, name, email, phone, whatsapp, is_primary").eq("account_id", draft.account_id),
  ])
  if (!account) return json({ error: "The account is gone" }, 404)
  const to = updateRecipients((contacts || []) as Contact[], countryCode) as {
    email: { contact: Contact; to: string } | null
    whatsapp: { contact: Contact; to: string } | null
  }
  const target = channel === "email" ? to.email : to.whatsapp
  if (!target) return json({ error: `Not sent. No contact with ${channel === "email" ? "an email address" : "a WhatsApp number"}.` }, 422)
  const mailer = channel === "email" ? await zohoMailer(sb) : null
  if (channel === "email" && !mailer) return json({ error: "Not sent. Zoho Mail is not connected (Settings, Zoho, Mail set to yes)." }, 422)

  // Claim the draft so a second tap or a second person cannot send it again.
  const { data: claimed } = await sb
    .from("client_update_drafts")
    .update({ status: "sent", body: text, sent_by: runBy, sent_at: new Date().toISOString(), sent_via: channel, sent_to: target.to, error: "" })
    .eq("id", draft.id)
    .eq("status", "draft")
    .select("id")
  if (!claimed || (claimed as unknown[]).length === 0) return json({ error: "This update was already sent or skipped." }, 409)

  if (channel === "email") {
    let err = ""
    try {
      const msg = updateEmail({ accountName: account.name, weekStart: draft.week_start, body: text }) as { subject: string; body: string }
      const result = await mailer!([{ to: target.to, subject: msg.subject, body: msg.body }])
      if (!result.sent) err = result.errors.join("; ") || "not sent"
    } catch (e) {
      err = String((e as Error).message || e).slice(0, 200)
    }
    if (err) {
      // Nothing went out: back to the queue so it can be sent once fixed.
      await sb
        .from("client_update_drafts")
        .update({ status: "draft", sent_by: "", sent_at: null, sent_via: "", sent_to: "", error: `Not sent: ${err}`.slice(0, 500) })
        .eq("id", draft.id)
      return json({ error: `Not sent. ${err}`.slice(0, 400) }, 502)
    }
  }

  await sb.from("account_activities").insert({
    id: crypto.randomUUID(),
    account_id: draft.account_id,
    user_email: runBy,
    kind: "system",
    body: updateTimelineText({ weekStart: draft.week_start, channel, to: target.to, sentBy: runBy }),
    created_at: new Date().toISOString(),
  })
  // WhatsApp: the app opens WhatsApp with this number and the text typed in.
  return json({ channel, to: target.to })
}, { secrets: ["CLIENT_UPDATE_CRON_SECRET"] }))
