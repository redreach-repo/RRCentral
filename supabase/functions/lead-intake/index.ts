// Lead intake: website forms, WhatsApp click to chat links and the AI CRM
// landing page all arrive here. Deploy with Verify JWT OFF (supabase/config.toml).
//
//   GET  ?form_token=1        a token for a website form (good 3 s to 2 h)
//   GET  ?wa=1&text=..&utm_*  counts a WhatsApp click, then sends it to wa.me
//   POST {name, email, phone, company, message, channel, pipeline, utm_*, page_url, form_token}
//
// A POST needs the shared LEAD_INTAKE_SECRET in x-lead-secret (for servers,
// such as the landing page) or a form token (for browsers). Rate limited per
// minute overall and per sender. The rules (matching, owner, tokens) are in
// app/src/lib/leadIntake.ts, bundled.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  formTokenProblem,
  LEAD_OWNER_KEYS,
  LEAD_RATE_LIMITS,
  LEAD_WHATSAPP_KEY,
  leadSourceLabel,
  makeFormToken,
  matchContact,
  matchCrm,
  nextAccountReference,
  parseLead,
  pickLeadOwner,
  senderHash,
  whatsappRedirect,
} from "./leadIntake.bundle.js"
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lead-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  }
}

const today = () => new Date().toISOString().slice(0, 10)

/** A value for a PostgREST or() filter, quoted so commas and brackets stay data. */
const q = (v: string) => `"${v.replace(/["\\]/g, "")}"`

/** Filters that find possible matches; the bundled rules then pick the real one. */
function matchFilters(lead: { email: string; phone: string }, emailCols: string[], phoneCols: string[]): string {
  const last7 = lead.phone.replace(/\D/g, "").slice(-7)
  return [
    ...(lead.email ? emailCols.map((c) => `${c}.ilike.${q(lead.email)}`) : []),
    ...(last7.length === 7 ? phoneCols.map((c) => `${c}.ilike.${q(`%${last7}%`)}`) : []),
  ].join(",")
}

Deno.serve(withErrorLog("lead-intake", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  // Fail closed: without the secret there are no tokens and no leads.
  const secret = Deno.env.get("LEAD_INTAKE_SECRET") || ""
  if (!secret) return json({ error: "LEAD_INTAKE_SECRET is not set" }, 503)
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return json({ error: "Server misconfigured" }, 500)
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const params = new URL(req.url).searchParams
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || ""
  const ipHash = await senderHash(ip, secret)

  /** Too many from everyone in the last minute, or from this sender in ten. */
  const overLimit = async (): Promise<boolean> => {
    const minuteAgo = new Date(Date.now() - 60_000).toISOString()
    const tenAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    const [all, mine] = await Promise.all([
      sb.from("website_inquiries").select("id", { count: "exact", head: true }).gt("created_at", minuteAgo),
      sb.from("website_inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gt("created_at", tenAgo),
    ])
    return (all.count ?? 0) >= LEAD_RATE_LIMITS.perMinute || (mine.count ?? 0) >= LEAD_RATE_LIMITS.perSenderPer10Min
  }

  const loadSettings = async (): Promise<Record<string, string>> => {
    const { data } = await sb
      .from("app_settings")
      .select("key, value")
      .in("key", [...Object.values(LEAD_OWNER_KEYS), LEAD_WHATSAPP_KEY, "whatsappCountryCode"])
    const out: Record<string, string> = {}
    for (const r of (data || []) as { key: string; value: string }[]) out[r.key] = r.value
    return out
  }

  if (req.method === "GET") {
    if (params.get("form_token") === "1") return json({ form_token: await makeFormToken(secret) })
    if (params.get("wa") === "1") {
      const target = whatsappRedirect(await loadSettings(), params.get("text") || "")
      // A click is counted, not a lead: the person has not told us who they are yet.
      if (!(await overLimit())) {
        const u = (k: string) => (params.get(`utm_${k}`) || "").slice(0, 200)
        const utm = { source: u("source"), medium: u("medium"), campaign: u("campaign"), term: u("term"), content: u("content") }
        await sb.from("website_inquiries").insert({
          name: "WhatsApp click",
          email: "",
          status: "click",
          channel: "whatsapp",
          source: leadSourceLabel({ channel: "whatsapp", utm }),
          utm_source: utm.source,
          utm_medium: utm.medium,
          utm_campaign: utm.campaign,
          utm_term: utm.term,
          utm_content: utm.content,
          page_url: (params.get("page") || req.headers.get("referer") || "").slice(0, 500),
          ip_hash: ipHash,
        })
      }
      return new Response(null, { status: 302, headers: { ...cors, Location: target, "Cache-Control": "no-store" } })
    }
    return json({ error: "Not found" }, 404)
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return json({ error: "Send the lead as JSON" }, 400)
  const bySecret = (req.headers.get("x-lead-secret") || "") === secret
  if (!bySecret) {
    const problem = await formTokenProblem(String(raw.form_token || ""), secret)
    if (problem) return json({ error: problem }, 401)
  }
  const parsed = parseLead(raw)
  // A bot filled the hidden field: say thanks and keep nothing.
  if ("spam" in parsed && parsed.spam) return json({ ok: true })
  if ("error" in parsed) return json({ error: parsed.error }, 400)
  const lead = parsed.lead
  if (!bySecret && (await overLimit())) return json({ error: "Too many messages. Try again in a few minutes." }, 429)

  const settings = await loadSettings()
  const cc = settings.whatsappCountryCode || "971"
  const { data: users } = await sb.from("app_users").select("id, name, email, active")
  const activeUsers = ((users || []) as { id: string; name: string; email: string; active: boolean | null }[]).filter(
    (u) => u.active !== false,
  )
  const owner = pickLeadOwner(settings, activeUsers.map((u) => u.id))
  if (owner.last) await sb.from("app_settings").upsert({ key: LEAD_OWNER_KEYS.last, value: owner.last }, { onConflict: "key" })
  const ownerUser = activeUsers.find((u) => u.id === owner.ownerId)
  const source = leadSourceLabel(lead)
  const displayName = lead.name || lead.company
  const note = [
    `New lead from ${source}`,
    lead.vertical ? `Desk: ${lead.vertical}` : "",
    lead.page_url ? `Page: ${lead.page_url}` : "",
    lead.message,
  ].filter(Boolean).join("\n")

  let accountId: string | null = null
  let crmId = ""
  let dealId = ""
  let matched = false

  if (lead.pipeline === "ai_crm") {
    // Phone first, then email, across AI CRM account contacts.
    const filters = matchFilters(lead, ["email"], ["phone", "whatsapp"])
    const { data: candidates } = await sb
      .from("account_contacts")
      .select("id, account_id, name, email, phone, whatsapp, accounts!inner(type)")
      .eq("accounts.type", "ai_crm_client")
      .or(filters)
      .limit(50)
    const contact = matchContact((candidates || []) as { id: string; account_id: string; email: string; phone: string; whatsapp: string }[], lead, cc)
    if (contact) {
      accountId = contact.account_id
      matched = true
    } else {
      const { data: refRows } = await sb.from("accounts").select("reference").eq("type", "ai_crm_client")
      const refs = ((refRows || []) as { reference: string }[]).map((r) => r.reference)
      for (let attempt = 0; attempt < 5 && !accountId; attempt++) {
        const reference = nextAccountReference("ai_crm_client", refs)
        const { data, error } = await sb
          .from("accounts")
          .insert({
            type: "ai_crm_client",
            name: lead.company || lead.name,
            reference,
            status: "prospect",
            owner_user_id: owner.ownerId,
            source,
            notes: note,
            created_by: "lead-intake",
          })
          .select("id")
          .single()
        if (!error && data) accountId = (data as { id: string }).id
        else if (error && error.code === "23505") refs.push(reference)
        else if (error) throw new Error(`Could not add the account: ${error.message}`)
      }
      if (!accountId) throw new Error("Could not find a free account reference")
      await sb.from("account_contacts").insert({
        account_id: accountId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        whatsapp: lead.channel === "whatsapp" ? lead.phone : "",
        is_primary: true,
      })
    }
    // One open deal per account: a known contact with an open deal gets a note, not a second deal.
    const { data: open } = await sb
      .from("sales_deals")
      .select("id")
      .eq("account_id", accountId)
      .not("stage", "in", "(signed,lost)")
      .limit(1)
      .maybeSingle()
    if (open) {
      dealId = (open as { id: string }).id
    } else {
      const { data: deal, error } = await sb
        .from("sales_deals")
        .insert({
          account_id: accountId,
          stage: "lead",
          source,
          owner_user_id: owner.ownerId,
          next_action: "Call the new lead",
          next_action_date: today(),
          notes: note,
          created_by: "lead-intake",
        })
        .select("id")
        .single()
      if (error) throw new Error(`Could not add the deal: ${error.message}`)
      dealId = (deal as { id: string }).id
    }
    await sb.from("account_activities").insert({
      account_id: accountId,
      kind: "system",
      body: note,
      user_email: "lead-intake",
    })
  } else {
    // Contacts kept inside a CRM row are checked on the rows found by the row's own fields.
    const filters = matchFilters(lead, ["email_phone"], ["mobile_number", "office_number", "email_phone"])
    const { data: rows } = await sb
      .from("crm")
      .select("id, pipeline_stage, mobile_number, office_number, email_phone, contacts, notes")
      .or(filters)
      .limit(50)
    const hit = matchCrm((rows || []) as { id: string; pipeline_stage: string; mobile_number: string; office_number: string; email_phone: string; contacts: { phone?: string; email?: string }[]; notes: string }[], lead, cc)
    const stamp = new Date().toISOString()
    if (hit) {
      matched = true
      crmId = hit.id
      await sb
        .from("crm")
        .update({ notes: [note, hit.notes].filter(Boolean).join("\n\n").slice(0, 20000), updated_at: stamp, updated_by: "lead-intake" })
        .eq("id", hit.id)
    } else {
      crmId = crypto.randomUUID()
      const { error } = await sb.from("crm").insert({
        id: crmId,
        company_name: lead.company || lead.name,
        primary_contact: lead.name,
        email_phone: lead.email,
        mobile_number: lead.phone,
        office_number: "",
        notes: note,
        follow_up_date: today(),
        next_action: "Call the new lead",
        owner: ownerUser?.name || "",
        company_owner: "",
        address: "",
        website: "",
        trn: "",
        pipeline_stage: "Lead",
        quote_ref: "",
        outcome_reason: "",
        calendar_event_id: "",
        contacts: [{ id: crypto.randomUUID(), name: lead.name, email: lead.email, phone: lead.phone, role: "Primary" }],
        created_by: "lead-intake",
        updated_by: "lead-intake",
        created_at: stamp,
        updated_at: stamp,
      })
      if (error) throw new Error(`Could not add the CRM lead: ${error.message}`)
    }
  }

  const { error: logError } = await sb.from("website_inquiries").insert({
    name: displayName,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    vertical: lead.vertical,
    message: lead.message,
    status: "converted",
    crm_id: crmId,
    channel: lead.channel,
    pipeline: lead.pipeline,
    source,
    utm_source: lead.utm.source,
    utm_medium: lead.utm.medium,
    utm_campaign: lead.utm.campaign,
    utm_term: lead.utm.term,
    utm_content: lead.utm.content,
    page_url: lead.page_url,
    account_id: accountId,
    deal_id: dealId,
    owner_user_id: owner.ownerId,
    matched,
    ip_hash: ipHash,
  })
  if (logError) console.error("lead-intake: could not log the lead", logError.message)

  return json({ ok: true, matched })
}, { secrets: ["LEAD_INTAKE_SECRET"] }))
