// Gap plan module 4: demo outbound guard. Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1"
import { allowedHosts, DemoOutboundBlocked, installDemoGuard, isDemoEnv, targetHost } from "../../functions/_shared/demoGuard.ts"

Deno.test("demo flag only from APP_ENV=demo", () => {
  assert(isDemoEnv((n) => (n === "APP_ENV" ? " Demo " : undefined)))
  assert(!isDemoEnv((n) => (n === "APP_ENV" ? "production" : undefined)))
  assert(!isDemoEnv(() => undefined))
})

Deno.test("allowed hosts: own Supabase + explicit list", () => {
  const hosts = allowedHosts("https://demo123.supabase.co", " api.example.com ,")
  assertEquals([...hosts].sort(), ["api.example.com", "demo123.supabase.co"])
  assertEquals(targetHost("https://api.stripe.com/v1/x"), "api.stripe.com")
  assertEquals(targetHost(new Request("https://graph.facebook.com/v1")), "graph.facebook.com")
})

Deno.test("outside demo nothing is wrapped", () => {
  const before = globalThis.fetch
  assert(!installDemoGuard(() => undefined))
  assertEquals(globalThis.fetch, before)
})

Deno.test("in demo, third parties are refused and own Supabase passes", async () => {
  const real = globalThis.fetch
  const seen: string[] = []
  globalThis.fetch = ((input: RequestInfo | URL) => {
    seen.push(targetHost(input))
    return Promise.resolve(new Response("ok"))
  }) as typeof fetch
  try {
    const env: Record<string, string> = { APP_ENV: "demo", SUPABASE_URL: "https://demo123.supabase.co" }
    assert(installDemoGuard((n) => env[n]))
    for (const url of ["https://api.stripe.com/v1/charges", "https://graph.facebook.com/v20.0/x/messages", "https://api.anthropic.com/v1/messages", "https://mail.zoho.com/api", "https://hooks.example.com"]) {
      await assertRejects(() => fetch(url), DemoOutboundBlocked)
    }
    const res = await fetch("https://demo123.supabase.co/rest/v1/app_errors")
    await res.body?.cancel()
    assertEquals(seen, ["demo123.supabase.co"])
  } finally {
    globalThis.fetch = real
  }
})
