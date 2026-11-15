// Demo isolation for Edge Functions (gap plan module 4, docs/modules/demo-isolation.md).
//
// In a demo project (function secret APP_ENV=demo) every outbound fetch is
// refused unless it goes to this project's own Supabase URL or a host listed
// in DEMO_OUTBOUND_ALLOW. So no email, WhatsApp, Stripe charge, AI call or
// webhook can leave a demo, whichever function tries. Installed once by
// withErrorLog, which every function uses.

export class DemoOutboundBlocked extends Error {
  constructor(public readonly host: string) {
    super(`Demo mode: outbound call to ${host} was blocked`)
    this.name = "DemoOutboundBlocked"
  }
}

export function isDemoEnv(get: (name: string) => string | undefined = (n) => Deno.env.get(n)): boolean {
  return (get("APP_ENV") || "").trim().toLowerCase() === "demo"
}

/** Hosts a demo may call: its own Supabase project plus DEMO_OUTBOUND_ALLOW (comma separated). */
export function allowedHosts(supabaseUrl: string, extra: string): Set<string> {
  const hosts = new Set<string>()
  try {
    if (supabaseUrl) hosts.add(new URL(supabaseUrl).host.toLowerCase())
  } catch {
    // ignore
  }
  for (const h of extra.split(",")) {
    const clean = h.trim().toLowerCase()
    if (clean) hosts.add(clean)
  }
  return hosts
}

export function targetHost(input: RequestInfo | URL): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  try {
    return new URL(raw).host.toLowerCase()
  } catch {
    return ""
  }
}

let installed = false

/** Wrap globalThis.fetch in demo mode. No-op outside demo. Returns whether it is active. */
export function installDemoGuard(get: (name: string) => string | undefined = (n) => Deno.env.get(n)): boolean {
  if (!isDemoEnv(get)) return false
  if (installed) return true
  installed = true
  const allow = allowedHosts(get("SUPABASE_URL") || "", get("DEMO_OUTBOUND_ALLOW") || "")
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const host = targetHost(input)
    if (!allow.has(host)) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "demo outbound blocked", source: "edge", host }))
      return Promise.reject(new DemoOutboundBlocked(host || "unknown"))
    }
    return realFetch(input, init)
  }) as typeof fetch
  return true
}
