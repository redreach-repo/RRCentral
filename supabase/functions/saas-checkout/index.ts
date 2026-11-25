/**
 * HighMast SaaS Checkout / Customer Portal (tenant plan billing).
 * Separate from Tee Tribe shop and from customer invoice pay links.
 * Uses RR_STRIPE_SECRET_KEY. Verify JWT is off; signed-in admin checked here.
 *
 *   POST { action: "checkout", plan_key, success_url, cancel_url } → { url }
 *   POST { action: "portal", return_url } → { url }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Stripe from "npm:stripe@22"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  buildSaasCheckoutParams,
  planByKey,
  randomIntegrationSuffix,
  saasCheckoutProblem,
  stripeTaxStubEnabled,
} from "./saasCheckout.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { serviceRoleKey, publicApiKey } from "../_shared/supabaseKeys.ts"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function corsHeadersFor(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  const allowed = raw
    ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean)
    : DEFAULT_ORIGINS
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

Deno.serve(withErrorLog("saas-checkout", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = publicApiKey() || ""
  const serviceKey = serviceRoleKey() || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  const { data: isAdmin } = await userDb.rpc("rr_is_admin")
  if (isAdmin !== true) return json({ error: "Only admins can manage the HighMast plan" }, 403)

  const { data: tenantIdRaw } = await userDb.rpc("rr_my_tenant_id")
  const tenantId = typeof tenantIdRaw === "string" ? tenantIdRaw : ""
  if (!tenantId) return json({ error: "No tenant on this login" }, 400)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = typeof body.action === "string" ? body.action : "checkout"

  const secret = Deno.env.get("RR_STRIPE_SECRET_KEY") || ""
  if (!secret) {
    return json({ error: "Card payments are not set up yet. Add RR_STRIPE_SECRET_KEY in Supabase." }, 503)
  }
  const stripe = new Stripe(secret, { apiVersion: "2026-07-29.dahlia" as Stripe.LatestApiVersion })
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: subRow } = await sb
    .from("tenant_subscriptions")
    .select("id, plan_key, status, seats, stripe_customer_id, stripe_subscription_id")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (action === "portal") {
    const customerId = String(subRow?.stripe_customer_id || "")
    if (!customerId) return json({ error: "Subscribe once before opening the billing portal" }, 400)
    const returnUrl =
      typeof body.return_url === "string" && /^https?:\/\//i.test(body.return_url)
        ? body.return_url
        : ""
    if (!returnUrl) return json({ error: "return_url must be an http(s) URL" }, 400)
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      })
      return json({ url: portal.url })
    } catch (e) {
      console.error("saas portal failed", e)
      return json({ error: "Could not open Stripe billing portal" }, 502)
    }
  }

  const problem = saasCheckoutProblem(body)
  if (problem) return json({ error: problem }, 400)

  const planKey = String(body.plan_key)
  const plan = planByKey(planKey)
  if (!plan) return json({ error: "Pick a HighMast plan" }, 400)

  const params = buildSaasCheckoutParams({
    plan,
    tenantId,
    successUrl: String(body.success_url),
    cancelUrl: String(body.cancel_url),
    stripeCustomerId: subRow?.stripe_customer_id || null,
    enableTaxStub: stripeTaxStubEnabled(Deno.env.toObject()),
  })

  try {
    const session = await stripe.checkout.sessions.create({
      ...params,
      // Do not set payment_method_types — dynamic payment methods from Dashboard.
      integration_identifier: `highmast-saas-${randomIntegrationSuffix()}`,
      allow_promotion_codes: true,
    } as Stripe.Checkout.SessionCreateParams)
    if (!session.url) return json({ error: "Stripe did not return a checkout URL" }, 502)

    // Ensure a local row exists so webhook upserts have a home.
    if (!subRow) {
      await sb.from("tenant_subscriptions").insert({
        tenant_id: tenantId,
        plan_key: plan.key,
        seats: plan.seatsIncluded,
        status: "trialing",
      })
    } else {
      await sb
        .from("tenant_subscriptions")
        .update({
          plan_key: plan.key,
          seats: plan.seatsIncluded,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subRow.id)
    }

    return json({ url: session.url, session_id: session.id })
  } catch (e) {
    console.error("saas checkout failed", e)
    return json({ error: "Stripe did not start checkout. Check the RR Stripe account, then try again." }, 502)
  }
}, { secrets: ["RR_STRIPE_SECRET_KEY"] }))
