/**
 * M10 light AI gateway: retrieve tenant knowledge docs via FTS RPC.
 * Optional stub answer from top hits (no external model call yet).
 * Auth: signed-in staff JWT (verify_jwt = false; check in code).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
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
    Vary: "Origin",
  }
}

Deno.serve(withErrorLog("hm-ai-gateway", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  if (!supabaseUrl || !anonKey) return json({ error: "Server misconfigured" }, 500)

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in first" }, 401)

  const { data: staff } = await userDb.rpc("rr_is_staff")
  if (staff !== true) return json({ error: "Staff only" }, 403)

  const body = (await req.json().catch(() => ({}))) as { query?: unknown; limit?: unknown; answer?: unknown }
  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (!query) return json({ error: "query required" }, 400)
  const limit = typeof body.limit === "number" ? Math.max(1, Math.min(20, Math.floor(body.limit))) : 5
  const wantAnswer = Boolean(body.answer)

  const { data: hits, error } = await userDb.rpc("rr_ai_search_docs", { p_query: query, p_limit: limit })
  if (error) return json({ error: error.message || "search failed" }, 500)

  const rows = (hits || []) as Array<{ id: string; title: string; body: string; source: string; rank: number }>
  let answer: string | undefined
  if (wantAnswer) {
    if (!rows.length) {
      answer = `No knowledge docs matched “${query}”.`
    } else {
      answer =
        `Retrieved ${rows.length} snippet(s) (draft — not model output):\n` +
        rows.slice(0, 3).map((h, i) => `${i + 1}. ${h.title || "Untitled"}: ${String(h.body || "").slice(0, 160)}`).join("\n")
    }
  }

  return json({ hits: rows, answer, mode: wantAnswer ? "retrieve_and_answer" : "retrieve" })
}))
