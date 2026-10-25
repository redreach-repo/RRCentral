// payment-reminder: one tap reminders are sent only by admin, manager or
// sales, only when a stage is due, and never twice for the same stage.
// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
//
// Supabase and Meta are faked by stubbing fetch, so these run offline.
import { assert, assertEquals } from "jsr:@std/assert@1"

type Handler = (req: Request) => Response | Promise<Response>

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://fake.supabase.co",
  SUPABASE_ANON_KEY: "test-public-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  META_ACCESS_TOKEN: "meta-token",
}

let handler: Handler | null = null
async function load(): Promise<Handler> {
  if (handler) return handler
  for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v)
  const real = Deno.serve
  // deno-lint-ignore no-explicit-any
  ;(Deno as any).serve = (...args: unknown[]) => {
    handler = args.find((a) => typeof a === "function") as Handler
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: {} }
  }
  try {
    await import(new URL("../../functions/payment-reminder/index.ts", import.meta.url).href)
  } finally {
    // deno-lint-ignore no-explicit-any
    ;(Deno as any).serve = real
  }
  assert(handler, "payment-reminder did not call Deno.serve")
  return handler
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

type World = {
  staff: boolean
  sentStages: number[]
  duplicate: boolean
  metaStatus: number
  calls: { method: string; url: string; body: string; auth: string }[]
}

function world(over: Partial<World> = {}): World {
  return { staff: true, sentStages: [], duplicate: false, metaStatus: 200, calls: [], ...over }
}

/** A fake Supabase (auth, PostgREST) and Meta Graph API. */
function fakeFetch(w: World) {
  const invoice = {
    id: "inv-1", account_id: "acc-1", client: "Clinic LLC", reference_number: "RR-03-26010",
    date: daysAgo(20), payment_terms: "Net 7 days", status: "Final", payment_status: "Pending", amount: 1050,
  }
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  return (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(String(input), init)
    const url = new URL(req.url)
    return req.text().then((body) => {
      w.calls.push({ method: req.method, url: req.url, body, auth: req.headers.get("Authorization") || "" })
      const one = (req.headers.get("Accept") || "").includes("vnd.pgrst.object")
      const rows = (r: unknown[]) => reply(one ? r[0] ?? null : r)
      if (url.hostname === "graph.facebook.com") return reply(w.metaStatus === 200 ? { messages: [{ id: "m1" }] } : { error: { message: "Template not approved" } }, w.metaStatus)
      if (url.pathname === "/auth/v1/user") return reply({ id: "user-1", email: "sales@redreach.ae", aud: "authenticated" })
      if (url.pathname === "/rest/v1/rpc/rr_is_staff") return reply(w.staff)
      if (url.pathname === "/rest/v1/rpc/rr_current_user_id") return reply("app-user-1")
      if (url.pathname === "/rest/v1/invoices") return rows([invoice])
      if (url.pathname === "/rest/v1/payment_log") return rows([])
      if (url.pathname === "/rest/v1/app_settings") return rows([])
      if (url.pathname === "/rest/v1/account_contacts") {
        return rows([{ id: "c1", name: "Dana", email: "dana@clinic.ae", phone: "", whatsapp: "0501234567", is_primary: true }])
      }
      if (url.pathname === "/rest/v1/invoice_reminders") {
        if (req.method === "POST") {
          return w.duplicate
            ? reply({ code: "23505", message: "duplicate key value violates unique constraint" }, 409)
            : reply(null, 201)
        }
        if (req.method === "DELETE") return reply(null, 204)
        return rows(w.sentStages.map((stage) => ({ stage })))
      }
      if (req.method === "POST") return reply(null, 201)
      return rows([])
    })
  }
}

async function send(w: World, payload: unknown, auth = "Bearer user-jwt") {
  const h = await load()
  const real = globalThis.fetch
  globalThis.fetch = fakeFetch(w) as typeof fetch
  try {
    const res = await h(new Request("https://fake.supabase.co/functions/v1/payment-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify(payload),
    }))
    return { status: res.status, body: await res.json() }
  } finally {
    globalThis.fetch = real
  }
}

const metaCalls = (w: World) => w.calls.filter((c) => c.url.includes("graph.facebook.com"))
const opts = { sanitizeOps: false, sanitizeResources: false }
const whatsapp = { invoice_id: "inv-1", channel: "whatsapp" }

Deno.test({ name: "refuses a caller who is not signed in", ...opts, fn: async () => {
  const w = world()
  assertEquals((await send(w, whatsapp, "")).status, 401)
  assertEquals(metaCalls(w).length, 0)
} })

Deno.test({ name: "refuses staff and viewers (only admin, manager and sales send)", ...opts, fn: async () => {
  const w = world({ staff: false })
  assertEquals((await send(w, whatsapp)).status, 403)
  assertEquals(metaCalls(w).length, 0)
} })

Deno.test({ name: "sends the due stage once, records it as the caller and writes the timeline", ...opts, fn: async () => {
  const w = world()
  const { status, body } = await send(w, whatsapp)
  assertEquals(status, 200)
  assertEquals(body, { sent: true, stage: 7, channel: "whatsapp", to: "971501234567" })
  const sent = metaCalls(w)
  assertEquals(sent.length, 1)
  const msg = JSON.parse(sent[0].body)
  assertEquals(msg.template.name, "rr_payment_reminder")
  assertEquals(msg.template.components[0].parameters.map((p: { text: string }) => p.text).slice(0, 2), ["Dana", "RR-03-26010"])
  const claim = w.calls.find((c) => c.method === "POST" && c.url.includes("/invoice_reminders"))!
  assertEquals(JSON.parse(claim.body).stage, 7)
  assertEquals(claim.auth, "Bearer user-jwt", "the reminder is recorded as the caller, so the audit log names them")
  const timeline = w.calls.find((c) => c.method === "POST" && c.url.includes("/account_activities"))!
  assert(JSON.parse(timeline.body).body.startsWith("7 day payment reminder for RR-03-26010"))
} })

Deno.test({ name: "never sends twice for the same stage", ...opts, fn: async () => {
  // Already recorded: nothing is due.
  const before = world({ sentStages: [7] })
  assertEquals((await send(before, whatsapp)).body.code, "not_due")
  assertEquals(metaCalls(before).length, 0)
  // Two presses at once: the second loses on the unique key and sends nothing.
  const race = world({ duplicate: true })
  const { status, body } = await send(race, whatsapp)
  assertEquals([status, body.code], [409, "already_sent"])
  assertEquals(metaCalls(race).length, 0)
} })

Deno.test({ name: "a failed send frees the stage so it can be pressed again", ...opts, fn: async () => {
  const w = world({ metaStatus: 400 })
  const { status, body } = await send(w, whatsapp)
  assertEquals([status, body.code], [502, "send_failed"])
  assert(w.calls.some((c) => c.method === "DELETE" && c.url.includes("/invoice_reminders")))
  assert(!w.calls.some((c) => c.url.includes("/account_activities")))
} })

Deno.test({ name: "says when a channel is not set up, before recording anything", ...opts, fn: async () => {
  const w = world()
  const { status, body } = await send(w, { invoice_id: "inv-1", channel: "email" })
  assertEquals([status, body.code], [422, "email_not_configured"])
  assert(!w.calls.some((c) => c.method === "POST" && c.url.includes("/invoice_reminders")))
} })
