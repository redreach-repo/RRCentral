// Tee Tribe shop checkout — creates a Stripe Checkout Session.
//
// GitHub Pages is static, so the live shop calls this Edge Function instead of
// the Vite dev-server middleware. Prices and validation come from
// app/src/shop/checkout.ts (bundled into checkout.bundle.js), never the browser.
//
// Deploy:  npx supabase functions deploy create-checkout-session --no-verify-jwt
// Secrets: npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//          npx supabase secrets set ALLOWED_ORIGINS=https://redreach-repo.github.io,https://www.redreach.ae
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Stripe from "npm:stripe@22"
import { buildCheckoutSessionParams, parseCheckoutRequest } from "./checkout.bundle.js"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  if (!raw) return DEFAULT_ORIGINS
  return raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean)
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || ""
  const allowed = allowedOrigins()
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, 405, { error: "POST only" })

  const origin = req.headers.get("Origin")
  if (origin && !allowedOrigins().includes(origin)) {
    return json(req, 403, { error: "Origin not allowed" })
  }

  const length = Number(req.headers.get("Content-Length") || 0)
  if (length > 32_000) return json(req, 413, { error: "Request too large" })

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json(req, 400, { error: "Invalid JSON" })
  }

  const parsed = parseCheckoutRequest(payload, allowedOrigins())
  if ("error" in parsed) return json(req, 400, { error: parsed.error })

  const built = buildCheckoutSessionParams(parsed)
  if (!built.ok) return json(req, 400, { error: built.error })

  const secret = Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_RESTRICTED_KEY")
  if (!secret) {
    return json(req, 503, { error: "Checkout is not configured yet. Please contact us to order." })
  }

  try {
    const stripe = new Stripe(secret, { apiVersion: "2026-07-29.dahlia" as Stripe.LatestApiVersion })
    const session = await stripe.checkout.sessions.create(
      built.params as unknown as Stripe.Checkout.SessionCreateParams,
    )
    return json(req, 200, { url: session.url, id: session.id, demo: false })
  } catch (e) {
    console.error("stripe checkout failed", e)
    return json(req, 502, { error: "Payment provider error — please try again." })
  }
})
