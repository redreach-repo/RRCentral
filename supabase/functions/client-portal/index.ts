// Client portal: an AI CRM client opens their private link and this function
// returns what they may see about their own account (tickets, build
// progress, usage against plan, the monthly report, quotes, invoices and the
// files they sent). The fields are chosen in app/src/lib/clientPortal.ts
// (bundled), never here.
//
//   POST { token, month? }                                 the portal
//   POST { token, action: "quote_pdf", quote_id }          a quote's PDF
//   POST { token, action: "accept_quote", quote_id, name, date, agreed: true }
//   POST { token, action: "ticket_message", ticket_id, message }
//   POST { token, action: "upload", filename, content_base64, note? }
//
// Every action is checked against the account behind the link. Accepting
// works only for a quote Red Reach sent with an accept link, and does exactly
// what the accept link does (_shared/quoteAcceptance.ts).
//
// The client is not signed in. The link's token is hashed and looked up in
// portal_access with the service role; a revoked, expired or unknown link
// gets the same plain answer.
//
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  DELIVERY_RATE_KEYS,
  acceptProblem,
  base64Bytes,
  buildPortalView,
  hashPortalToken,
  isPortalToken,
  portalAccessState,
  portalMessageProblem,
  portalUploadProblem,
  ratesFromSettings,
  safeUploadName,
  uploadContentType,
  workDriveFolderId,
} from "./clientPortal.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { acceptQuote } from "../_shared/quoteAcceptance.ts"
import { workDriveUploader } from "../_shared/zohoWorkDrive.ts"

type PortalAccessRow = {
  id: string
  account_id: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const NOT_VALID = "This link does not work any more. Ask Red Reach for a new one."

Deno.serve(withErrorLog("client-portal", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof body.token === "string" ? body.token : ""
  const month = typeof body.month === "string" && /^\d{4}-\d{2}-01$/.test(body.month) ? body.month : null
  if (!isPortalToken(token)) return json({ error: NOT_VALID }, 404)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const { data: access } = await sb
    .from("portal_access")
    .select("id, account_id, expires_at, revoked_at, last_used_at")
    .eq("token_hash", await hashPortalToken(token))
    .maybeSingle()
  const row = access as PortalAccessRow | null
  if (!row || portalAccessState(row, now) !== "active") return json({ error: NOT_VALID }, 404)

  const accountId = row.account_id
  const { data: account } = await sb.from("accounts").select("name, reference, type").eq("id", accountId).maybeSingle()
  if (!account || (account as { type: string }).type !== "ai_crm_client") return json({ error: NOT_VALID }, 404)
  const accountName = (account as { name: string }).name

  const action = typeof body.action === "string" ? body.action : "view"
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

  // A quote of this account with an accept link: the live one, or the accepted one.
  async function quoteWithLink(quoteId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return null
    const { data: q } = await sb
      .from("quotations")
      .select("id, account_id, client, reference_number, base_reference, status")
      .eq("id", quoteId)
      .eq("account_id", accountId)
      .maybeSingle()
    if (!q) return null
    const { data: links } = await sb
      .from("quote_accept_links")
      .select("id, expires_at, revoked_at, accepted_at")
      .eq("quotation_id", quoteId)
      .order("created_at", { ascending: false })
    const list = (links || []) as { id: string; expires_at: string | null; revoked_at: string | null; accepted_at: string | null }[]
    const accepted = list.find((l) => l.accepted_at)
    const live = list.find((l) => !l.accepted_at && !l.revoked_at && (!l.expires_at || Date.parse(l.expires_at) > now.getTime()))
    return { quote: q as { id: string; account_id: string | null; client: string; reference_number: string; base_reference: string; status: string }, accepted, live }
  }

  if (action === "quote_pdf") {
    const found = await quoteWithLink(str(body.quote_id, 40))
    const link = found?.accepted || found?.live
    if (!found || !link) return json({ error: "That quote is not available here." }, 404)
    const { data: pdf } = await sb.from("quote_accept_pdfs").select("pdf_base64").eq("link_id", link.id).maybeSingle()
    if (!pdf) return json({ error: "There is no PDF for this quote yet. Ask Red Reach to send it." }, 404)
    return json({ pdf_base64: (pdf as { pdf_base64: string }).pdf_base64, filename: `${found.quote.reference_number || "quote"}.pdf` })
  }

  if (action === "accept_quote") {
    const found = await quoteWithLink(str(body.quote_id, 40))
    if (!found) return json({ error: "That quote is not available here." }, 404)
    if (found.accepted) return json({ error: "This quote was already accepted." }, 409)
    if (!found.live || !["Finalized", "Sent"].includes(found.quote.status)) {
      return json({ error: "This quote can no longer be accepted. Ask Red Reach for a new one." }, 409)
    }
    const name = str(body.name, 200)
    const date = str(body.date, 10)
    const problem = acceptProblem({ name, date, agreed: body.agreed === true }, now)
    if (problem) return json({ error: problem }, 400)
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || ""
    const done = await acceptQuote(sb, {
      link: found.live,
      quote: found.quote,
      name,
      date,
      ip,
      userAgent: req.headers.get("user-agent") || "",
      source: "client-portal",
      now,
    })
    if (!done) return json({ error: "This quote was already accepted." }, 409)
    return json({ ok: true })
  }

  if (action === "ticket_message") {
    const ticketId = str(body.ticket_id, 40)
    const message = typeof body.message === "string" ? body.message.trim() : ""
    const problem = portalMessageProblem(message)
    if (problem) return json({ error: problem }, 400)
    if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return json({ error: "That ticket is not available here." }, 404)
    const { data: t } = await sb.from("tickets").select("id, status, subject").eq("id", ticketId).eq("account_id", accountId).maybeSingle()
    const ticket = t as { id: string; status: string; subject: string } | null
    if (!ticket || !["new", "open", "waiting_on_client"].includes(ticket.status)) {
      return json({ error: "That ticket is closed. Open a new one with Red Reach if you still need help." }, 404)
    }
    const { error: mErr } = await sb.from("ticket_messages").insert({
      ticket_id: ticket.id,
      author_kind: "contact",
      author_label: "Client portal",
      body: message,
    })
    if (mErr) throw new Error(`Could not save the message: ${mErr.message}`)
    // The client answered, so the ticket is back with the team.
    if (ticket.status === "waiting_on_client") {
      await sb.from("tickets").update({ status: "open", updated_at: now.toISOString() }).eq("id", ticket.id)
    }
    await sb.from("account_activities").insert({
      account_id: accountId,
      kind: "system",
      body: `New message from the client portal on ticket "${ticket.subject || "No subject"}".`,
      user_email: "client-portal",
    })
    return json({ ok: true })
  }

  if (action === "upload") {
    const filename = safeUploadName(str(body.filename, 300))
    const content = typeof body.content_base64 === "string" ? body.content_base64.replace(/\s/g, "") : ""
    const size = base64Bytes(content)
    const problem = portalUploadProblem({ filename, size })
    if (problem) return json({ error: problem }, 400)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) return json({ error: "The file could not be read. Try again." }, 400)
    const contentType = uploadContentType(filename) || "application/octet-stream"
    // At most 20 files a day per link, so a leaked link cannot fill the database.
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString()
    const { count } = await sb
      .from("portal_uploads")
      .select("id", { count: "exact", head: true })
      .eq("portal_access_id", row.id)
      .gte("created_at", dayAgo)
    if ((count ?? 0) >= 20) return json({ error: "That is the most files for one day. Try again tomorrow." }, 429)

    const { data: saved, error: uErr } = await sb
      .from("portal_uploads")
      .insert({
        account_id: accountId,
        portal_access_id: row.id,
        filename,
        content_type: contentType,
        size_bytes: size,
        note: str(body.note, 1000),
        content_base64: content,
      })
      .select("id")
      .single()
    if (uErr) throw new Error(`Could not save the file: ${uErr.message}`)
    const uploadId = (saved as { id: string }).id

    // Into the client's WorkDrive folder, when there is one.
    let inWorkDrive = false
    try {
      const upload = await workDriveUploader(sb)
      const { data: crm } = await sb
        .from("crm")
        .select("drive_folder_url")
        .ilike("company_name", accountName.replace(/[%_]/g, ""))
        .neq("drive_folder_url", "")
        .limit(1)
      const folderId = workDriveFolderId(((crm || [])[0] as { drive_folder_url?: string } | undefined)?.drive_folder_url || "")
      if (upload && folderId) {
        const bin = atob(content)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const file = await upload({ folderId, filename, contentType, bytes })
        await sb
          .from("portal_uploads")
          .update({ status: "in_workdrive", workdrive_id: file.id, workdrive_url: file.url, content_base64: "", error: "" })
          .eq("id", uploadId)
        inWorkDrive = true
      } else {
        await sb
          .from("portal_uploads")
          .update({ error: upload ? "No WorkDrive folder for this client yet" : "WorkDrive is not set up" })
          .eq("id", uploadId)
      }
    } catch (e) {
      // The file is safe in RR Central; the team can file it by hand.
      await sb.from("portal_uploads").update({ error: String((e as Error).message || e).slice(0, 300) }).eq("id", uploadId)
    }
    await sb.from("account_activities").insert({
      account_id: accountId,
      kind: "system",
      body: `The client uploaded ${filename} from the portal.${inWorkDrive ? " It is in their WorkDrive folder." : " It is waiting under Client uploads on the account."}`,
      user_email: "client-portal",
    })
    return json({ ok: true })
  }

  if (action !== "view") return json({ error: "Unknown action" }, 400)

  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 7, 1)).toISOString().slice(0, 10)
  const settingKeys = ["companyName", ...Object.values(DELIVERY_RATE_KEYS as Record<string, string>)]
  const [contracts, packages, stages, requirements, tickets, usage, entries, settings, quotes, invoices, uploads, goLive] = await Promise.all([
    sb.from("contracts").select("*").eq("account_id", accountId),
    sb.from("delivery_packages").select("*"),
    sb.from("build_stages").select("*").eq("account_id", accountId),
    sb.from("requirements").select("title, status, is_change_request").eq("account_id", accountId),
    sb
      .from("tickets")
      .select("id, subject, status, created_at, sla_due_at, first_response_at, resolved_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(500),
    sb.from("usage_records").select("*").eq("account_id", accountId),
    sb.from("time_entries").select("date, hours, category").eq("account_id", accountId).gte("date", since),
    sb.from("app_settings").select("key, value").in("key", settingKeys),
    sb
      .from("quotations")
      .select("id, reference_number, date, valid_until, amount, status, quotation_currency, currency, quote_accept_links(id, expires_at, revoked_at, accepted_at, accepted_name)")
      .eq("account_id", accountId)
      .order("date", { ascending: false })
      .limit(50),
    sb
      .from("invoices")
      .select("id, reference_number, date, amount, status, payment_status, payment_terms, currency, pay_link_url")
      .eq("account_id", accountId)
      .order("date", { ascending: false })
      .limit(50),
    sb
      .from("portal_uploads")
      .select("filename, size_bytes, created_at, status")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("build_tasks")
      .select("title, stage, sort, done, done_at, kind, owner, due_date")
      .eq("account_id", accountId)
      .eq("kind", "golive")
      .limit(100),
  ])
  const failed = [contracts, packages, stages, requirements, tickets, usage, entries].find((r) => r.error)
  if (failed?.error) return json({ error: "The portal could not load. Please try again later." }, 500)

  // Quotes, invoices and uploads come from later updates: until their SQL runs the portal shows none.
  type LinkRow = { id: string; expires_at: string | null; revoked_at: string | null; accepted_at: string | null; accepted_name: string }
  const quoteRows = ((quotes.error ? [] : quotes.data) || []) as (Record<string, unknown> & { quote_accept_links?: LinkRow[] })[]
  const withLinks = quoteRows.filter((q) => (q.quote_accept_links || []).length > 0)
  const linkIds = withLinks.flatMap((q) => (q.quote_accept_links || []).map((l) => l.id))
  const pdfIds = new Set<string>()
  if (linkIds.length) {
    const { data: pdfs } = await sb.from("quote_accept_pdfs").select("link_id").in("link_id", linkIds)
    for (const p of (pdfs || []) as { link_id: string }[]) pdfIds.add(p.link_id)
  }
  const invoiceRows = ((invoices.error ? [] : invoices.data) || []) as { reference_number: string }[]
  const refs = invoiceRows.map((i) => i.reference_number).filter(Boolean)
  const payments = refs.length ? await sb.from("payment_log").select("invoice_ref, amount").in("invoice_ref", refs) : { data: [] }

  const settingMap: Record<string, string> = {}
  for (const s of (settings.data || []) as { key: string; value: string }[]) settingMap[s.key] = s.value

  // Note the visit, at most once an hour.
  if (!row.last_used_at || now.getTime() - Date.parse(row.last_used_at) > 3_600_000) {
    await sb.from("portal_access").update({ last_used_at: now.toISOString() }).eq("id", row.id)
  }

  const view = buildPortalView({
    now,
    month,
    companyName: settingMap.companyName || "Red Reach Middle East FZE",
    account: account as { name: string; reference: string },
    contracts: contracts.data || [],
    packages: packages.data || [],
    stages: stages.data || [],
    requirements: requirements.data || [],
    tickets: tickets.data || [],
    usage: usage.data || [],
    entries: entries.data || [],
    rates: ratesFromSettings(settingMap),
    quotes: withLinks.map((q) => ({
      ...(q as Record<string, unknown>),
      links: (q.quote_accept_links || []).map((l) => ({ ...l, has_pdf: pdfIds.has(l.id) })),
    })),
    invoices: invoiceRows as never[],
    payments: ((payments.data || []) as { invoice_ref: string; amount: number }[]),
    uploads: ((uploads.error ? [] : uploads.data) || []) as never[],
    goLive: ((goLive.error ? [] : goLive.data) || []) as never[],
  })
  return json(view)
}))
