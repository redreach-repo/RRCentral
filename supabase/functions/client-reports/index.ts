// Monthly client reports: on the 1st, build each AI CRM client's report for
// the month just ended and draft its summary with AI into the Approve queue
// (Accounts > Monthly reports). Nothing is sent from the schedule. A person
// checks the draft and presses Send, and only then does this email it (Zoho
// Mail) and send it on WhatsApp (a Meta template) to the primary contact.
//
//   POST {}                                    build drafts (schedule or manager)
//   POST { action: "build", month? }           the same, by hand, for a month
//   POST { action: "send", draft_id, channels: ["email", "whatsapp"], summary }
//
// Who may call:
//  * build: header x-cron-secret = CLIENT_REPORT_CRON_SECRET, or a signed in
//    manager or admin.
//  * send: a signed in admin, manager or sales person who can edit the account.
//
// The report numbers and AI prompt are the same as the client portal and the
// report page: app/src/lib/clientReports.ts (bundled). The AI cost of each
// draft is logged against the account in ai_usage_log. Each client gets one
// draft per month (unique key), so running twice adds nothing.
//
// Secrets: CLIENT_REPORT_CRON_SECRET, ANTHROPIC_API_KEY (no key: drafts are
// made with an empty summary to write by hand), and for WhatsApp
// WHATSAPP_PHONE_NUMBER_ID, META_ACCESS_TOKEN, optional
// CLIENT_REPORT_WHATSAPP_TEMPLATE (default rr_monthly_report) and
// CLIENT_REPORT_WHATSAPP_LANGUAGE (default en).
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).
// Steps: docs/client-reports.md.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.132.0"
import {
  AI_MODEL,
  DELIVERY_RATE_KEYS,
  aiCostUsd,
  buildAiRequest,
  buildPortalView,
  factsForReport,
  monthLabelOf,
  ratesFromSettings,
  reportCandidates,
  reportEmail,
  reportMonthFor,
  reportRecipients,
  reportTimelineText,
  reportWhatsAppValues,
  sendProblem,
  tidyAiText,
} from "./clientReports.bundle.js"
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
const RUN_BY = "RR Central monthly reports"

/** Now, shifted so that its UTC date and month are Dubai's (UTC+4, no daylight saving). */
function dubaiToday(): Date {
  return new Date(Date.now() + 4 * 60 * 60 * 1000)
}

type Contact = { id: string; name: string; email: string; phone: string; whatsapp: string; is_primary: boolean }

/** The report for one account, built the same way as the client portal. */
async function reportFor(sb: SupabaseClient, account: { id: string; name: string; reference: string }, month: string, shared: {
  packages: unknown[]
  settings: Record<string, string>
}) {
  const id = account.id
  const since = month.slice(0, 10)
  const [contracts, stages, requirements, tickets, usage, entries] = await Promise.all([
    sb.from("contracts").select("*").eq("account_id", id),
    sb.from("build_stages").select("*").eq("account_id", id),
    sb.from("requirements").select("title, status, is_change_request").eq("account_id", id),
    sb.from("tickets").select("id, subject, status, created_at, sla_due_at, first_response_at, resolved_at").eq("account_id", id).limit(1000),
    sb.from("usage_records").select("*").eq("account_id", id),
    sb.from("time_entries").select("date, hours, category").eq("account_id", id).gte("date", since),
  ])
  const failed = [contracts, stages, requirements, tickets, usage, entries].find((r) => r.error)
  if (failed?.error) throw new Error(`Could not load ${account.name}: ${failed.error.message}`)
  // The report month must be one the portal offers, so build it as of the month's last day.
  const asOf = new Date(`${since}T12:00:00Z`)
  asOf.setUTCMonth(asOf.getUTCMonth() + 1, 0)
  return buildPortalView({
    now: asOf,
    month: since,
    companyName: shared.settings.companyName || "Red Reach Middle East FZE",
    account: { name: account.name, reference: account.reference || "" },
    contracts: contracts.data || [],
    packages: shared.packages,
    stages: stages.data || [],
    requirements: requirements.data || [],
    tickets: tickets.data || [],
    usage: usage.data || [],
    entries: entries.data || [],
    rates: ratesFromSettings(shared.settings),
  })
}

async function draftSummary(apiKey: string, accountName: string, month: string, facts: string[]) {
  const request = buildAiRequest({ feature: "report_summary", accountName, monthLabel: monthLabelOf(month), facts })
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: [{ role: "user", content: request.user }],
    output_config: { effort: "low" },
  })
  let text = ""
  for (const block of message.content) if (block.type === "text") text += block.text
  return {
    text: message.stop_reason === "refusal" ? "" : tidyAiText(text),
    model: message.model || AI_MODEL,
    usage: message.usage,
    costUsd: aiCostUsd(message.usage) as number,
  }
}

async function sendWhatsApp(to: string, values: string[]): Promise<string | null> {
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || ""
  const token = Deno.env.get("META_ACCESS_TOKEN") || ""
  const version = Deno.env.get("META_GRAPH_VERSION") || "v21.0"
  const template = Deno.env.get("CLIENT_REPORT_WHATSAPP_TEMPLATE") || "rr_monthly_report"
  const language = Deno.env.get("CLIENT_REPORT_WHATSAPP_LANGUAGE") || "en"
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
  if (res.ok) return null
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  return body.error?.message || `WhatsApp answered ${res.status}`
}

Deno.serve(withErrorLog("client-reports", async (req) => {
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
  const cronSecret = Deno.env.get("CLIENT_REPORT_CRON_SECRET") || ""
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
      if (allowed !== true) return json({ error: "Only managers and admins can build the monthly reports" }, 403)
    } else {
      const { data: allowed } = await userDb.rpc("rr_is_staff")
      if (allowed !== true) return json({ error: "Only admins, managers and sales can send reports to clients" }, 403)
    }
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: settingRows } = await sb
    .from("app_settings")
    .select("key, value")
    .in("key", ["companyName", "whatsappCountryCode", ...Object.values(DELIVERY_RATE_KEYS as Record<string, string>)])
  const settings: Record<string, string> = {}
  for (const r of (settingRows || []) as { key: string; value: string }[]) settings[r.key] = String(r.value ?? "")

  // ---- Build the month's drafts ----
  if (action === "build") {
    const asked = typeof body.month === "string" && /^\d{4}-\d{2}-01$/.test(body.month) ? body.month : ""
    const month = asked || reportMonthFor(dubaiToday())
    const [accounts, contracts, existing, packages] = await Promise.all([
      sb.from("accounts").select("id, name, reference, type, status").eq("type", "ai_crm_client"),
      sb.from("contracts").select("account_id, status, term_start, term_end"),
      sb.from("client_report_drafts").select("account_id, month").eq("month", month),
      sb.from("delivery_packages").select("*"),
    ])
    if (existing.error) return json({ error: "Run the monthly reports SQL first (client_report_drafts is missing)." }, 503)
    const todo = reportCandidates({
      accounts: (accounts.data || []) as never[],
      contracts: (contracts.data || []) as never[],
      existing: (existing.data || []) as never[],
      month,
    }) as { id: string; name: string; reference: string }[]

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || ""
    const made: string[] = []
    const problems: string[] = []
    for (const account of todo) {
      try {
        const view = await reportFor(sb, account, month, { packages: packages.data || [], settings })
        const facts = factsForReport(view) as string[]
        let summary = ""
        let costUsd = 0
        let error = ""
        if (!apiKey) {
          error = "AI help is not set up (ANTHROPIC_API_KEY), so write the summary by hand."
        } else {
          try {
            const ai = await draftSummary(apiKey, account.name, month, facts)
            summary = ai.text.slice(0, 3000)
            costUsd = ai.costUsd
            await sb.from("ai_usage_log").insert({
              account_id: account.id,
              feature: "report_summary",
              model: ai.model,
              input_tokens: ai.usage.input_tokens || 0,
              output_tokens: ai.usage.output_tokens || 0,
              cost_usd: costUsd,
              created_by: runBy,
            })
            if (!summary) error = "The AI draft came back empty, so write the summary by hand."
          } catch (e) {
            error = `The AI draft did not work (${String((e as Error).message || e).slice(0, 150)}), so write the summary by hand.`
          }
        }
        const { error: insErr } = await sb.from("client_report_drafts").insert({
          account_id: account.id,
          month,
          summary,
          facts,
          ai_cost_usd: costUsd,
          error,
          created_by: runBy,
        })
        if (insErr && insErr.code !== "23505") throw new Error(insErr.message)
        if (!insErr) made.push(account.name)
      } catch (e) {
        problems.push(`${account.name}: ${String((e as Error).message || e).slice(0, 200)}`)
      }
    }
    if (problems.length && !made.length) throw new Error(`No report drafts were made. ${problems.join("; ")}`)
    return json({ month, drafted: made, problems })
  }

  // ---- Send one approved draft ----
  const draftId = typeof body.draft_id === "string" && UUID.test(body.draft_id) ? body.draft_id : ""
  if (!draftId) return json({ error: "Which report?" }, 400)
  const channels = (Array.isArray(body.channels) ? body.channels : []).filter((c): c is string => typeof c === "string")
  const wanted = [...new Set(channels)] as ("email" | "whatsapp")[]
  const summary = typeof body.summary === "string" ? body.summary.trim() : ""

  const { data: draft } = await sb.from("client_report_drafts").select("*").eq("id", draftId).maybeSingle()
  if (!draft) return json({ error: "That report draft was not found" }, 404)
  const { data: canEdit } = await userDb.rpc("rr_can_write_account", { target: draft.account_id })
  if (canEdit !== true) return json({ error: "You can only send reports for accounts you can edit" }, 403)
  const problem = sendProblem({ status: draft.status, summary, channels: wanted })
  if (problem) return json({ error: problem }, 409)

  const [{ data: account }, { data: contacts }] = await Promise.all([
    sb.from("accounts").select("id, name").eq("id", draft.account_id).maybeSingle(),
    sb.from("account_contacts").select("id, name, email, phone, whatsapp, is_primary").eq("account_id", draft.account_id),
  ])
  if (!account) return json({ error: "The account is gone" }, 404)
  const to = reportRecipients((contacts || []) as Contact[], settings.whatsappCountryCode || "971") as {
    email: { contact: Contact; to: string } | null
    whatsapp: { contact: Contact; to: string } | null
  }

  const mailer = wanted.includes("email") ? await zohoMailer(sb) : null
  const failed: string[] = []
  const ready: ("email" | "whatsapp")[] = []
  for (const c of wanted) {
    if (c === "email" && !to.email) failed.push("email: no contact with an email address")
    else if (c === "email" && !mailer) failed.push("email: Zoho Mail is not connected (Settings, Zoho, Mail set to yes)")
    else if (c === "whatsapp" && !to.whatsapp) failed.push("WhatsApp: no contact with a WhatsApp number")
    else if (c === "whatsapp" && (!Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || !Deno.env.get("META_ACCESS_TOKEN"))) {
      failed.push("WhatsApp: sending is not set up yet")
    } else ready.push(c)
  }
  if (!ready.length) return json({ error: `Not sent. ${failed.join("; ")}.` }, 422)

  // Claim the draft so a second press or a second person cannot send it again.
  const { data: claimed } = await sb
    .from("client_report_drafts")
    .update({ status: "sent", summary, sent_by: runBy, sent_at: new Date().toISOString(), error: "" })
    .eq("id", draft.id)
    .eq("status", "draft")
    .select("id")
  if (!claimed || (claimed as unknown[]).length === 0) return json({ error: "This report was already sent or skipped." }, 409)

  const facts = (Array.isArray(draft.facts) ? draft.facts : []).map(String)
  const sent: { channel: "email" | "whatsapp"; to: string }[] = []
  for (const c of ready) {
    try {
      if (c === "email") {
        const msg = reportEmail({
          contactName: to.email!.contact.name || "",
          accountName: account.name,
          month: draft.month,
          summary,
          facts,
          companyName: settings.companyName || "Red Reach Middle East FZE",
          senderName: runBy.split("@")[0].replace(/[._-]+/g, " "),
        }) as { subject: string; body: string }
        const result = await mailer!([{ to: to.email!.to, subject: msg.subject, body: msg.body }])
        if (result.sent) sent.push({ channel: c, to: to.email!.to })
        else failed.push(`email: ${result.errors.join("; ") || "not sent"}`)
      } else {
        const err = await sendWhatsApp(
          to.whatsapp!.to,
          reportWhatsAppValues({ contactName: to.whatsapp!.contact.name || "", month: draft.month, summary }) as string[],
        )
        if (err) failed.push(`WhatsApp: ${err}`)
        else sent.push({ channel: c, to: to.whatsapp!.to })
      }
    } catch (e) {
      failed.push(`${c === "email" ? "email" : "WhatsApp"}: ${String((e as Error).message || e).slice(0, 200)}`)
    }
  }

  if (!sent.length) {
    // Nothing went out: back to the queue so it can be sent once fixed.
    await sb
      .from("client_report_drafts")
      .update({ status: "draft", sent_by: "", sent_at: null, error: `Not sent: ${failed.join("; ")}`.slice(0, 500) })
      .eq("id", draft.id)
    return json({ error: `Not sent. ${failed.join("; ")}`.slice(0, 400) }, 502)
  }

  await sb
    .from("client_report_drafts")
    .update({
      sent_email_to: sent.find((s) => s.channel === "email")?.to || "",
      sent_whatsapp_to: sent.find((s) => s.channel === "whatsapp")?.to || "",
      error: failed.length ? `Not sent: ${failed.join("; ")}`.slice(0, 500) : "",
    })
    .eq("id", draft.id)
  await sb.from("account_activities").insert({
    id: crypto.randomUUID(),
    account_id: draft.account_id,
    user_email: runBy,
    kind: "system",
    body: reportTimelineText({ month: draft.month, sent, failed, sentBy: runBy }),
    created_at: new Date().toISOString(),
  })
  return json({ sent, failed })
}, { secrets: ["CLIENT_REPORT_CRON_SECRET"] }))
