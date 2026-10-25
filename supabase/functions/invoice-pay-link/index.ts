// Pay by card: makes a Stripe payment link for what is still owed on a
// finalised invoice, in the invoice's currency. Works once, then closes.
// Separate Stripe keys from the Tee Tribe shop: RR_STRIPE_SECRET_KEY.
// Verify JWT is off (supabase/config.toml); the signed in user is checked here.
// Rules in app/src/lib/invoicePayLink.ts (bundled).
//
//   POST { invoice_id }   ->  { url, amount, currency }

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Stripe from "npm:stripe@22"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { invoiceCurrency, outstanding, payLinkParams, payLinkProblem } from "./invoicePayLink.bundle.js"
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

type PayLinkInvoice = {
  id: string
  reference_number: string
  client: string
  amount: number
  status: string
  payment_status: string
  currency?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(withErrorLog("invoice-pay-link", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Verify JWT is off for this function, so check the signed in user here, before anything else.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  const { data: isTeam } = await userDb.rpc("rr_is_staff")
  if (isTeam !== true) return json({ error: "Only admins, managers and sales can make payment links" }, 403)

  const body = (await req.json().catch(() => ({}))) as { invoice_id?: unknown }
  const invoiceId = typeof body.invoice_id === "string" && UUID.test(body.invoice_id) ? body.invoice_id : ""
  if (!invoiceId) return json({ error: "Pick an invoice" }, 400)

  const secret = Deno.env.get("RR_STRIPE_SECRET_KEY") || ""
  if (!secret) return json({ error: "Card payments are not set up yet. Add RR_STRIPE_SECRET_KEY in Supabase." }, 503)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: invRow } = await sb
    .from("invoices")
    .select("id, reference_number, client, amount, status, payment_status, currency, pay_link_id, pay_link_url, pay_link_amount")
    .eq("id", invoiceId)
    .maybeSingle()
  if (!invRow) return json({ error: "Invoice not found" }, 404)
  const inv = invRow as PayLinkInvoice & { pay_link_id: string; pay_link_url: string; pay_link_amount: number | null }
  const { data: pays } = await sb.from("payment_log").select("amount").eq("invoice_ref", inv.reference_number)
  const paid = ((pays || []) as { amount: number }[]).reduce((s, p) => s + Number(p.amount || 0), 0)
  const problem = payLinkProblem(inv, paid)
  if (problem) return json({ error: problem }, 400)
  const owed = outstanding(inv.amount, paid)
  const currency = invoiceCurrency(inv)

  // The same amount is still owed: the link already made still works.
  if (inv.pay_link_url && Number(inv.pay_link_amount) === owed) return json({ url: inv.pay_link_url, amount: owed, currency, reused: true })

  const { data: settings } = await sb.from("app_settings").select("value").eq("key", "companyName").maybeSingle()
  const stripe = new Stripe(secret, { apiVersion: "2026-07-29.dahlia" as Stripe.LatestApiVersion })
  const params = payLinkParams(inv, owed, (settings as { value?: string } | null)?.value || "Red Reach")
  try {
    if (inv.pay_link_id) await stripe.paymentLinks.update(inv.pay_link_id, { active: false }).catch(() => null)
    const price = await stripe.prices.create(params.price as unknown as Stripe.PriceCreateParams)
    const link = await stripe.paymentLinks.create({
      ...(params.link as unknown as Stripe.PaymentLinkCreateParams),
      line_items: [{ price: price.id, quantity: 1 }],
    })
    await sb
      .from("invoices")
      .update({ pay_link_id: link.id, pay_link_url: link.url, pay_link_amount: owed, pay_link_created_at: new Date().toISOString() })
      .eq("id", inv.id)
    return json({ url: link.url, amount: owed, currency })
  } catch (e) {
    console.error("stripe payment link failed", e)
    return json({ error: "Stripe did not make the link. Check the RR Stripe account, then try again." }, 502)
  }
}, { secrets: ["RR_STRIPE_SECRET_KEY"] }))
