// Daily digest: each morning, what needs attention in RR Central (tickets
// near or past their reply time, renewals in the next 60 days, overdue CTRM
// next actions, clients over hours, contract invoices drafted today, and from
// the watchdog stale deals and late invoices), sent to the people on the digest list
// by email (Zoho Mail) and WhatsApp (a Meta template). Rules live in
// app/src/lib/dailyDigest.ts (bundled).
//
// Called two ways:
//  * "Send now" in the app: a signed in manager or admin (their JWT).
//  * The daily schedule: header x-cron-secret = DIGEST_CRON_SECRET. The
//    schedule sends at most once a day, and skips a day with nothing to report.
//
// Email uses the Zoho connection already saved in Settings (Mail set to yes).
// Secrets (each channel is skipped while its settings are missing):
//   WHATSAPP_PHONE_NUMBER_ID, META_ACCESS_TOKEN, optional META_GRAPH_VERSION
//   (default v21.0), optional DIGEST_WHATSAPP_TEMPLATE (default rr_daily_digest)
//   and DIGEST_WHATSAPP_LANGUAGE (default en)
//   DIGEST_CRON_SECRET (for the schedule)
//   optional APP_URL (default https://redreach-repo.github.io/RRCentral)
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).
// (the function checks the caller itself, so the schedule can call it).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import {
  buildDigest,
  digestCount,
  digestEmail,
  digestTargets,
  digestWhatsAppValues,
} from "./dailyDigest.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { zohoMailer } from "../_shared/zohoMail.ts"

// Shapes from app/src/lib/dailyDigest.ts (the bundle is plain JS).
type Digest = { date: string }
type DigestRecipient = {
  name: string
  email: string
  whatsapp_phone: string
  by_email: boolean
  by_whatsapp: boolean
  active: boolean
}

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

type ChannelStatus = "ok" | "not_configured" | "error" | "no_recipients"

/** Every row of a table (PostgREST returns at most 1000 at a time). */
async function selectAll(sb: SupabaseClient, table: string, columns: string, filter?: (q: any) => any) {
  const rows: unknown[] = []
  for (let from = 0; from < 50_000; from += 1000) {
    let q = sb.from(table).select(columns).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

function monthStartTwoBack(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
  return d.toISOString().slice(0, 10)
}

// ---- WhatsApp through a Meta message template ----

async function sendWhatsApp(phones: string[], values: string[]) {
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || ""
  const token = Deno.env.get("META_ACCESS_TOKEN") || ""
  const version = Deno.env.get("META_GRAPH_VERSION") || "v21.0"
  const template = Deno.env.get("DIGEST_WHATSAPP_TEMPLATE") || "rr_daily_digest"
  const language = Deno.env.get("DIGEST_WHATSAPP_LANGUAGE") || "en"
  let sent = 0
  const errors: string[] = []
  for (const to of phones) {
    const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: language },
          components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }],
        },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (res.ok) sent++
    else {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      errors.push(`${to}: ${body.error?.message || res.status}`)
    }
  }
  return { sent, errors }
}

Deno.serve(withErrorLog("daily-digest", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Who is calling: the schedule (shared secret) or a manager or admin.
  let trigger: "manual" | "schedule" = "manual"
  let requestedBy = ""
  const cronSecret = Deno.env.get("DIGEST_CRON_SECRET") || ""
  const providedSecret = req.headers.get("x-cron-secret") || ""
  if (providedSecret) {
    if (!cronSecret || providedSecret !== cronSecret) return json({ error: "Unauthorized" }, 401)
    trigger = "schedule"
    requestedBy = "schedule"
  } else {
    const authHeader = req.headers.get("Authorization") || ""
    if (!authHeader) return json({ error: "Sign in to RR Central first" }, 401)
    const userDb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: allowed } = await userDb.rpc("rr_is_manager_or_admin")
    if (allowed !== true) return json({ error: "Only managers and admins can send the digest" }, 403)
    const { data: who } = await userDb.auth.getUser()
    requestedBy = who?.user?.email || ""
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const now = new Date()

  let digest: Digest
  let recipients: DigestRecipient[]
  try {
    const { data: recipientRows, error: recipientError } = await sb.from("digest_recipients").select("*")
    if (recipientError) return json({ error: "Could not read the digest list. Has the daily digest SQL been run?" }, 500)
    recipients = (recipientRows || []) as DigestRecipient[]
    const [accounts, contracts, packages, entries, tickets, deals] = await Promise.all([
      selectAll(sb, "accounts", "id, name, type"),
      selectAll(sb, "contracts", "*"),
      selectAll(sb, "delivery_packages", "id, target_hours"),
      selectAll(sb, "time_entries", "account_id, date, hours", (q) => q.gte("date", monthStartTwoBack(now))),
      selectAll(sb, "tickets", "id, subject, account_id, status, created_at, sla_due_at, first_response_at", (q) =>
        q.in("status", ["new", "open", "waiting_on_client"])),
      selectAll(sb, "ctrm_deals", "id, account_id, stage, next_action, next_action_date", (q) =>
        q.not("stage", "in", "(signed,lost)")),
    ])
    // Error monitoring (item 14): skip quietly if its SQL has not been run yet.
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const errors = await selectAll(sb, "app_errors", "message, created_at", (q) => q.gte("created_at", since)).catch(() => [])
    // Stale deals and late invoices from the 07:30 watchdog (Wave 2, PR F).
    const watch = await selectAll(sb, "watch_items", "kind, severity, title, reason, link, owner_label", (q) =>
      q.is("cleared_at", null).in("kind", ["stale_deal", "invoice_overdue"])).catch(() => [])
    // Drafts raised by the 06:00 contract-invoices run (Wave 2, PR E).
    const drafts = await selectAll(sb, "contract_invoices", "id", (q) =>
      q.gte("created_at", since).not("invoice_id", "is", null)).catch(() => [])
    // Quotes waiting for a reply (Wave 3, PR L).
    const sentQuotes = await selectAll(sb, "quotations", "id, client, reference_number, division_code, amount, status, account_id, quotation_currency, sent_at, followed_up_at", (q) =>
      q.eq("status", "Sent")).catch(() => [])
    const quoteDeals = await selectAll(sb, "sales_deals", "id, account_id, stage, quote_reference, monthly_fee, last_touch_at, quote_sent_at", (q) =>
      q.eq("stage", "quote_sent")).catch(() => [])
    // New leads from lead-intake (Wave 3, PR J).
    const leads = await selectAll(sb, "website_inquiries", "id, name, email, phone, source, channel, status, pipeline, account_id, crm_id, deal_id, matched, created_at", (q) =>
      q.gte("created_at", since).in("status", ["new", "converted"])).catch(() => [])
    // Open CTRM Next client issues (Wave 5, PR W): skip quietly if its SQL has not been run yet.
    const ctrmIssues = await selectAll(sb, "tickets", "id, subject, account_id, status, created_at, channel, assignee_user_id, vendor_ticket_ref, vendor_status, client_updated_at, vendor_fixed_at", (q) =>
      q.eq("channel", "ctrm_next").in("status", ["new", "open", "waiting_on_client"])).catch(() => [])
    // CTRM Next renewal dates (Wave 5, PR Y).
    const ctrmTerms = await selectAll(sb, "ctrm_client_terms", "account_id, renewal_date, notice_days", (q) =>
      q.not("renewal_date", "is", null)).catch(() => [])
    digest = buildDigest({ now, accounts, contracts, packages, entries, tickets, deals, errors, watch, contractDrafts: drafts.length, sentQuotes, quoteDeals, leads, ctrmIssues, ctrmTerms }) as Digest
  } catch (e) {
    return json({ error: `Could not build the digest: ${(e as Error).message}`.slice(0, 300) }, 500)
  }
  const count = digestCount(digest) as number

  // One scheduled digest a day: the unique index refuses a second one.
  const { data: run, error: runError } = await sb
    .from("digest_runs")
    .insert({ run_date: digest.date, trigger, requested_by: requestedBy, item_count: count })
    .select("id")
    .single()
  if (runError?.code === "23505") return json({ skipped: true, message: "Already sent today." })
  if (runError) return json({ error: "Could not log the digest. Has the daily digest SQL been run?" }, 500)

  const finish = async (fields: Record<string, unknown>) => {
    if (run?.id) await sb.from("digest_runs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", run.id)
  }

  if (trigger === "schedule" && count === 0) {
    await finish({ message: "Nothing needed attention, so nothing was sent." })
    return json({ skipped: true, items: 0, message: "Nothing needed attention, so nothing was sent." })
  }

  const { emails, phones } = digestTargets(recipients) as { emails: string[]; phones: string[] }
  const appUrl = Deno.env.get("APP_URL") || "https://redreach-repo.github.io/RRCentral"
  const messages: string[] = []
  let emailStatus: ChannelStatus = emails.length ? "ok" : "no_recipients"
  let whatsappStatus: ChannelStatus = phones.length ? "ok" : "no_recipients"
  let emailsSent = 0
  let whatsappSent = 0

  if (emails.length) {
    try {
      const mailer = await zohoMailer(sb)
      if (!mailer) emailStatus = "not_configured"
      else {
        const { subject, body } = digestEmail(digest, appUrl) as { subject: string; body: string }
        const result = await mailer(emails.map((to) => ({ to, subject, body })))
        emailsSent = result.sent
        if (result.errors.length) {
          emailStatus = result.sent ? "ok" : "error"
          messages.push(`Email: ${result.errors.join("; ")}`.slice(0, 300))
        }
      }
    } catch (e) {
      emailStatus = "error"
      messages.push(`Email: ${(e as Error).message}`.slice(0, 300))
    }
  }

  if (phones.length) {
    if (!Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || !Deno.env.get("META_ACCESS_TOKEN")) whatsappStatus = "not_configured"
    else {
      try {
        const result = await sendWhatsApp(phones, digestWhatsAppValues(digest) as string[])
        whatsappSent = result.sent
        if (result.errors.length) {
          whatsappStatus = result.sent ? "ok" : "error"
          messages.push(`WhatsApp: ${result.errors.join("; ")}`.slice(0, 300))
        }
      } catch (e) {
        whatsappStatus = "error"
        messages.push(`WhatsApp: ${(e as Error).message}`.slice(0, 300))
      }
    }
  }

  await finish({
    emails_sent: emailsSent,
    whatsapp_sent: whatsappSent,
    email_status: emailStatus,
    whatsapp_status: whatsappStatus,
    message: messages.join(" ").slice(0, 1000),
  })
  return json({
    items: count,
    email: emailStatus,
    whatsapp: whatsappStatus,
    emailsSent,
    whatsappSent,
    message: messages.join(" "),
  })
}, { secrets: ["DIGEST_CRON_SECRET"] }))
