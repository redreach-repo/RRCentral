// Shared by every Edge Function: failures go to app_errors, and a harmless
// ping (?ping=1) answers for the System check page without running the
// function. Wrap the handler: Deno.serve(withErrorLog("name", handler, { secrets }))
//
// Failures logged: anything thrown, and any answer with status 500 or more
// (including "not set up yet" 503s). Rows have kind 'function' and the
// function name in `page`, so admins see them on App errors and System check.

type Handler = (req: Request) => Response | Promise<Response>

export type HealthOptions = {
  /** Secrets the function needs. "A|B" means either one is enough. */
  secrets?: string[]
}

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

const env = (name: string) => Deno.env.get(name) || ""

function cors(req: Request): Record<string, string> {
  const raw = env("ALLOWED_ORIGINS")
  const allowed = raw ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean) : DEFAULT_ORIGINS
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  }
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  })

/** Secrets from `secrets` that are not set. */
export function missingSecrets(secrets: string[] = []): string[] {
  return secrets.filter((s) => !s.split("|").some((name) => env(name.trim())))
}

/** Save one failure to app_errors with the service key. Never throws. */
export async function logFunctionError(fn: string, message: string, detail = ""): Promise<void> {
  const url = env("SUPABASE_URL")
  const key = env("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/app_errors`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        kind: "function",
        message: (message || `${fn} failed`).slice(0, 1000),
        detail: detail.slice(0, 4000),
        page: fn.slice(0, 500),
        release: "edge",
      }),
      signal: AbortSignal.timeout(5_000),
    })
    await res.body?.cancel()
  } catch {
    // Logging must never turn into a second failure.
  }
}

/** True when the caller's JWT belongs to an RR Central admin. */
async function callerIsAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || ""
  const url = env("SUPABASE_URL")
  const anon = env("SUPABASE_ANON_KEY")
  if (!/^Bearer\s+\S+/i.test(auth) || !url || !anon) return false
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/rr_is_admin`, {
      method: "POST",
      headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5_000),
    })
    return res.ok && (await res.json()) === true
  } catch {
    return false
  }
}

/** Anyone learns the function is up; only admins see which secrets are missing. */
async function ping(req: Request, fn: string, opts: HealthOptions): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) })
  const body: Record<string, unknown> = { ok: true, function: fn, ping: true }
  if (await callerIsAdmin(req)) body.missing = missingSecrets(opts.secrets)
  return json(req, body)
}

function short(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown }
    if (parsed && typeof parsed.error === "string") return parsed.error.slice(0, 300)
  } catch {
    // not JSON
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 300)
}

export function withErrorLog(fn: string, handler: Handler, opts: HealthOptions = {}): Handler {
  return async (req: Request) => {
    if (new URL(req.url).searchParams.get("ping") === "1") return ping(req, fn, opts)
    try {
      const res = await handler(req)
      if (res.status >= 500) {
        const text = await res.clone().text().catch(() => "")
        await logFunctionError(fn, `${fn} answered ${res.status}: ${short(text) || "no detail"}`, `${req.method} ${new URL(req.url).pathname}`)
      }
      return res
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      await logFunctionError(fn, `${fn} crashed: ${err.message || err.name}`, err.stack || "")
      return json(req, { error: "Something went wrong on the server. It has been logged for the admins." }, 500)
    }
  }
}
