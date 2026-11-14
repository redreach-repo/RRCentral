// AI approval queue: ask Claude for suggested CRM actions on one account and
// store them as PENDING proposals in ai_action_proposals. Nothing in the CRM
// changes here. A person approves, edits or rejects each proposal in
// RR Central (/ai-approvals), and only an approved proposal runs, as the
// approving user, through rr_ai_proposal_decide().
//
// The caller must be signed in and able to edit the account. Proposals are
// inserted with the caller's own token, so row level security and the insert
// trigger (pending only, proposer stamped) apply.
//
// Secret: ANTHROPIC_API_KEY (same key as ai-assist).
// Deploy: Actions > Deploy Edge Functions, Function = other, name hm-ai-propose.
// verify_jwt stays on (the default), and the user is checked again here.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.132.0"
import { AI_MODEL, aiCostUsd } from "../ai-assist/aiAssist.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { type AccountContext, buildProposeRequest, normaliseInstruction, parseProposals, PROPOSAL_SCHEMA } from "./proposals.ts"

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

Deno.serve(withErrorLog("hm-ai-propose", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || ""
  if (!apiKey) return json({ error: "AI is not set up yet. Add the ANTHROPIC_API_KEY secret in Supabase." }, 503)

  const body = (await req.json().catch(() => ({}))) as { account_id?: unknown; instruction?: unknown }
  const accountId = typeof body.account_id === "string" && UUID.test(body.account_id) ? body.account_id : ""
  const instruction = normaliseInstruction(body.instruction)
  if (!accountId || !instruction) return json({ error: "Pick an account and say what you want done." }, 400)

  const { data: allowed } = await userDb.rpc("rr_can_write_account", { target: accountId })
  if (allowed !== true) return json({ error: "You can only ask for AI suggestions on accounts you can edit" }, 403)

  // Read the account as the caller (their RLS), never with the service key.
  const { data: acct } = await userDb.from("accounts")
    .select("name, industry, country, city, website, notes").eq("id", accountId).maybeSingle()
  if (!acct) return json({ error: "Account not found" }, 404)
  const { data: recent } = await userDb.from("account_activities")
    .select("kind, body, created_at").eq("account_id", accountId)
    .order("created_at", { ascending: false }).limit(10)
  const account: AccountContext = { ...(acct as AccountContext), recent: (recent || []) as AccountContext["recent"] }

  const request = buildProposeRequest(account, instruction)
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
      // Same settings as ai-assist: a short structured answer, no thinking.
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: PROPOSAL_SCHEMA } },
    })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return json({ error: "The Anthropic API key was refused. Check the ANTHROPIC_API_KEY secret." }, 502)
    }
    if (e instanceof Anthropic.RateLimitError) return json({ error: "AI is busy. Please try again in a minute." }, 429)
    if (e instanceof Anthropic.APIError) {
      console.error("hm-ai-propose Anthropic APIError", e.status)
      return json({ error: `AI suggestions failed (${e.status || "error"}). Please try again.` }, 502)
    }
    return json({ error: "AI could not be reached. Please try again." }, 502)
  }

  const costUsd = aiCostUsd(message.usage)
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { error: logError } = await sb.from("ai_usage_log").insert({
    account_id: accountId,
    feature: "ai_propose",
    model: message.model || AI_MODEL,
    input_tokens: message.usage.input_tokens || 0,
    output_tokens: message.usage.output_tokens || 0,
    cost_usd: costUsd,
    created_by: who.user.email || "",
  })
  if (logError) console.error("ai_usage_log insert failed", logError.message)

  if (message.stop_reason === "refusal") return json({ error: "AI could not suggest anything for this one." }, 422)
  if (message.stop_reason === "max_tokens") return json({ error: "AI answer was cut off. Ask for fewer changes." }, 502)
  let text = ""
  for (const block of message.content) if (block.type === "text") text += block.text
  const proposals = parseProposals(text, account)
  if (!proposals.length) return json({ proposals: [], costUsd })

  // The cost is split evenly across the proposals of one call.
  const share = Math.round((costUsd / proposals.length) * 1_000_000) / 1_000_000
  const { data: saved, error: saveError } = await userDb.from("ai_action_proposals").insert(
    proposals.map((p) => ({
      account_id: accountId,
      action: p.action,
      payload: p.payload,
      summary: p.summary,
      rationale: p.rationale,
      prompt: instruction,
      model: message.model || AI_MODEL,
      input_tokens: Math.round((message.usage.input_tokens || 0) / proposals.length),
      output_tokens: Math.round((message.usage.output_tokens || 0) / proposals.length),
      cost_usd: share,
    })),
  ).select("id, action, payload, summary, rationale, status, created_at")
  if (saveError) {
    console.error("ai_action_proposals insert failed", saveError.code)
    return json({ error: "The suggestions could not be saved. Has the AI approval queue SQL been run?" }, 500)
  }
  return json({ proposals: saved || [], costUsd })
}, { secrets: ["ANTHROPIC_API_KEY"] }))
