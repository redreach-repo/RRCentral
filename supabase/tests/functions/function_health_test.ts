// withErrorLog: failures reach app_errors, ?ping=1 answers without running the function.
// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1"
import { missingSecrets, withErrorLog } from "../../functions/_shared/functionHealth.ts"

type Call = { url: string; body: string; headers: Headers }

function stubFetch(answer: (url: string) => Response): { calls: Call[]; restore: () => void } {
  const real = globalThis.fetch
  const calls: Call[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push({ url, body: String(init?.body ?? ""), headers: new Headers(init?.headers) })
    return answer(url)
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = real) }
}

Deno.env.set("SUPABASE_URL", "https://project.supabase.co")
Deno.env.set("SUPABASE_ANON_KEY", "public-key")
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key")
Deno.env.delete("HEALTH_TEST_SECRET")

const req = (path = "", init: RequestInit = {}) =>
  new Request("https://project.supabase.co/functions/v1/demo" + path, { method: "POST", ...init })

Deno.test("ping answers without running the function", async () => {
  let ran = false
  const handler = withErrorLog("demo", () => {
    ran = true
    return new Response("ran")
  })
  const res = await handler(req("?ping=1"))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
  assertEquals(body.function, "demo")
  assertEquals(body.missing, undefined, "no caller JWT, so no secret names")
  assertEquals(ran, false)
  const pre = await handler(req("?ping=1", { method: "OPTIONS" }))
  assertEquals(pre.status, 200)
  assert(pre.headers.get("Access-Control-Allow-Origin"))
  await pre.body?.cancel()
})

Deno.test("an admin's ping lists missing secrets", async () => {
  const f = stubFetch((url) => new Response(url.includes("rr_is_admin") ? "true" : "false"))
  try {
    const handler = withErrorLog("demo", () => new Response("ran"), { secrets: ["HEALTH_TEST_SECRET", "SUPABASE_URL|OTHER"] })
    const res = await handler(req("?ping=1", { headers: { Authorization: "Bearer admin-jwt" } }))
    assertEquals((await res.json()).missing, ["HEALTH_TEST_SECRET"])
    assertEquals(f.calls[0].headers.get("Authorization"), "Bearer admin-jwt")
  } finally {
    f.restore()
  }
})

Deno.test("a non-admin's ping does not list secrets", async () => {
  const f = stubFetch(() => new Response("false"))
  try {
    const handler = withErrorLog("demo", () => new Response("ran"), { secrets: ["HEALTH_TEST_SECRET"] })
    const res = await handler(req("?ping=1", { headers: { Authorization: "Bearer staff-jwt" } }))
    assertEquals((await res.json()).missing, undefined)
  } finally {
    f.restore()
  }
})

Deno.test("a crash is logged to app_errors and answered with 500", async () => {
  const f = stubFetch(() => new Response(null, { status: 201 }))
  try {
    const handler = withErrorLog("demo", () => {
      throw new Error("boom")
    })
    const res = await handler(req())
    assertEquals(res.status, 500)
    await res.body?.cancel()
    assertEquals(f.calls.length, 1)
    assertEquals(f.calls[0].url, "https://project.supabase.co/rest/v1/app_errors")
    assertEquals(f.calls[0].headers.get("apikey"), "service-key")
    const row = JSON.parse(f.calls[0].body)
    assertEquals(row.kind, "function")
    assertEquals(row.page, "demo")
    assertEquals(row.message, "demo crashed: boom")
  } finally {
    f.restore()
  }
})

Deno.test("a 5xx answer is logged with its error text, a 4xx is not", async () => {
  const f = stubFetch(() => new Response(null, { status: 201 }))
  try {
    const failing = withErrorLog("demo", () => new Response(JSON.stringify({ error: "Key not set" }), { status: 503 }))
    const res = await failing(req())
    assertEquals(res.status, 503)
    assertEquals((await res.json()).error, "Key not set", "the caller still gets the original answer")
    assertEquals(JSON.parse(f.calls[0].body).message, "demo answered 503: Key not set")

    const refused = withErrorLog("demo", () => new Response("no", { status: 401 }))
    await (await refused(req())).body?.cancel()
    assertEquals(f.calls.length, 1)
  } finally {
    f.restore()
  }
})

Deno.test("logging failures never break the answer", async () => {
  const f = stubFetch(() => {
    throw new Error("network down")
  })
  try {
    const handler = withErrorLog("demo", () => new Response("x", { status: 500 }))
    assertEquals((await handler(req())).status, 500)
  } finally {
    f.restore()
  }
})

Deno.test("missingSecrets treats A|B as either one", () => {
  Deno.env.set("HEALTH_TEST_B", "set")
  assertEquals(missingSecrets(["HEALTH_TEST_A|HEALTH_TEST_B", "HEALTH_TEST_SECRET"]), ["HEALTH_TEST_SECRET"])
})
