// Quote accept link: a client opens a private link, sees the quote PDF and
// accepts it with their name and the date. Deploy with Verify JWT OFF
// (supabase/config.toml): the link token is the only key. Only its SHA-256
// hash is stored (quote_accept_links.token_hash), as with the client portal.
//
//   POST { token }                                  the quote's headline
//   POST { token, action: "pdf" }                   the PDF as it was sent
//   POST { token, action: "accept", name, date, agreed: true }
//
// Accepting moves the quote to Accepted, the AI CRM deal with this quote to
// Signed with a DRAFT contract, and an open CRM lead for the client to Won.
// Nothing is invoiced or billed: a person finalises. Rules in
// app/src/lib/quoteAccept.ts (bundled).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  acceptableStatus,
  acceptLinkState,
  acceptProblem,
  acceptView,
  hashAcceptToken,
  isAcceptToken,
} from "./quoteAccept.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { acceptQuote } from "../_shared/quoteAcceptance.ts"

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

type LinkRow = {
  id: string
  quotation_id: string
  expires_at: string | null
  revoked_at: string | null
  last_opened_at: string | null
  accepted_at: string | null
  accepted_name: string
}

Deno.serve(withErrorLog("quote-accept", async (req) => {
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
  if (!isAcceptToken(token)) return json({ error: NOT_VALID }, 404)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const { data: found } = await sb
    .from("quote_accept_links")
    .select("id, quotation_id, expires_at, revoked_at, last_opened_at, accepted_at, accepted_name")
    .eq("token_hash", await hashAcceptToken(token))
    .maybeSingle()
  const link = found as LinkRow | null
  // An accepted link still opens, so the client can see what they accepted.
  const state = link ? acceptLinkState(link, now) : "revoked"
  if (!link || (state !== "active" && state !== "accepted")) return json({ error: NOT_VALID }, 404)

  const { data: quoteRow } = await sb
    .from("quotations")
    .select("id, account_id, client, reference_number, base_reference, division_code, date, valid_until, amount, status, description, quotation_currency, currency")
    .eq("id", link.quotation_id)
    .maybeSingle()
  if (!quoteRow) return json({ error: NOT_VALID }, 404)
  const quote = quoteRow as {
    id: string
    account_id: string | null
    client: string
    reference_number: string
    base_reference: string
    division_code: string
    date: string | null
    valid_until: string | null
    amount: number
    status: string
    description: string
    quotation_currency: string
    currency: string
  }

  const action = typeof body.action === "string" ? body.action : "view"

  if (action === "pdf") {
    const { data: pdf } = await sb.from("quote_accept_pdfs").select("pdf_base64").eq("link_id", link.id).maybeSingle()
    if (!pdf) return json({ error: "There is no PDF on this link." }, 404)
    return json({ pdf_base64: (pdf as { pdf_base64: string }).pdf_base64, filename: `${quote.reference_number || "quote"}.pdf` })
  }

  if (action === "accept") {
    if (state === "accepted") return json({ error: "This quote was already accepted." }, 409)
    if (!acceptableStatus(quote.status)) return json({ error: "This quote can no longer be accepted. Ask Red Reach for a new one." }, 409)
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const date = typeof body.date === "string" ? body.date : ""
    const problem = acceptProblem({ name, date, agreed: body.agreed === true }, now)
    if (problem) return json({ error: problem }, 400)

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || ""
    const done = await acceptQuote(sb, {
      link,
      quote,
      name,
      date,
      ip,
      userAgent: req.headers.get("user-agent") || "",
      source: "quote-accept",
      now,
    })
    if (!done) return json({ error: "This quote was already accepted." }, 409)
    return json(acceptView({ ...quote, status: "Accepted" }, { ...link, accepted_at: now.toISOString(), accepted_name: name, has_pdf: true }, now))
  }

  // Note the visit, at most once an hour.
  if (!link.last_opened_at || now.getTime() - Date.parse(link.last_opened_at) > 3_600_000) {
    await sb.from("quote_accept_links").update({ last_opened_at: now.toISOString() }).eq("id", link.id)
  }
  const { count } = await sb.from("quote_accept_pdfs").select("link_id", { count: "exact", head: true }).eq("link_id", link.id)
  return json(acceptView(quote, { ...link, has_pdf: (count ?? 0) > 0 }, now))
}))
