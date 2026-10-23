// AI help inside RR Central: summarise a ticket thread, draft a reply, write
// the monthly report summary, or turn call notes into requirements. Uses
// Claude Haiku and logs the cost of every request against the account in
// ai_usage_log, so it counts in that client's profitability.
//
// The prompts, model and cost sum are in app/src/lib/aiAssist.ts (bundled).
// The caller must be signed in and able to edit the account.
//
// Secret: ANTHROPIC_API_KEY (an Anthropic API key, not the admin key that
// usage-import uses).
//
// Deploy: npx supabase functions deploy ai-assist --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.132.0"
import {
  AI_MODEL,
  aiCostUsd,
  buildAiRequest,
  normaliseAiInput,
  parseRequirements,
  tidyAiText,
} from "./aiAssist.bundle.js"

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

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || ""
  if (!apiKey) return json({ error: "AI help is not set up yet. Add the ANTHROPIC_API_KEY secret in Supabase." }, 503)

  const body = (await req.json().catch(() => ({}))) as { account_id?: unknown; input?: unknown }
  const accountId = typeof body.account_id === "string" && UUID.test(body.account_id) ? body.account_id : ""
  const input = normaliseAiInput(body.input)
  if (!accountId || !input) return json({ error: "Nothing to work with. Add some text first." }, 400)

  // Who is asking, and may they work on this account?
  const authHeader = req.headers.get("Authorization") || ""
  if (!authHeader) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
  const { data: who } = await userDb.auth.getUser()
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  const { data: allowed } = await userDb.rpc("rr_can_write_account", { target: accountId })
  if (allowed !== true) return json({ error: "You can only use AI help on accounts you can edit" }, 403)

  const request = buildAiRequest(input)
  const schema = request.schema
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
      output_config: {
        effort: "low",
        ...(schema ? { format: { type: "json_schema", schema } } : {}),
      },
    })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return json({ error: "The Anthropic API key was refused. Check the ANTHROPIC_API_KEY secret." }, 502)
    }
    if (e instanceof Anthropic.RateLimitError) {
      return json({ error: "AI help is busy. Please try again in a minute." }, 429)
    }
    if (e instanceof Anthropic.APIError) {
      return json({ error: "AI help is not available right now. Please try again." }, 502)
    }
    return json({ error: "AI help could not be reached. Please try again." }, 502)
  }

  const costUsd = aiCostUsd(message.usage)
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { error: logError } = await sb.from("ai_usage_log").insert({
    account_id: accountId,
    feature: input.feature,
    model: message.model || AI_MODEL,
    input_tokens: message.usage.input_tokens || 0,
    output_tokens: message.usage.output_tokens || 0,
    cost_usd: costUsd,
    created_by: who.user.email || "",
  })
  if (logError) console.error("ai_usage_log insert failed", logError.message)

  if (message.stop_reason === "refusal") {
    return json({ error: "AI help could not answer this one. Please write it yourself." }, 422)
  }
  let text = ""
  for (const block of message.content) {
    if (block.type === "text") text += block.text
  }
  if (input.feature === "call_notes") {
    return json({ text: "", requirements: parseRequirements(text), costUsd })
  }
  text = tidyAiText(text)
  if (!text) return json({ error: "AI help came back empty. Please try again." }, 502)
  return json({ text, requirements: [], costUsd })
})
