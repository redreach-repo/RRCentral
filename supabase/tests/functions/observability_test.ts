// Gap plan module 3: Edge scrubber matches the app's, structured log shape,
// Sentry off without a DSN. Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1"
import { scrubText as edgeScrub, scrubValue as edgeScrubValue } from "../../functions/_shared/scrub.ts"
import { scrubText as appScrub, scrubValue as appScrubValue } from "../../../app/src/lib/observability/scrub.ts"
import { formatEdgeLine, requestIdFor } from "../../functions/_shared/structuredLog.ts"
import { buildEnvelope, parseDsn, sendToSentry } from "../../functions/_shared/sentry.ts"

const SAMPLES = [
  "Bearer abcdefghijklmnop and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  "IBAN AE070331234567890123456, EID 784-1990-1234567-1, card 4111111111111111",
  "alfred@redreach.ae +971 50 123 4567 ?token=abc&x=1 hm_" + "a".repeat(64) + " sk_live_abcdefghij",
  "Invoice RR-01-26003 AED 1,250.00 on 2026-11-14",
]

Deno.test("edge scrubber is identical to the app scrubber", () => {
  for (const s of SAMPLES) assertEquals(edgeScrub(s), appScrub(s))
  const obj = { password: "x", nested: { note: SAMPLES[2] } }
  assertEquals(edgeScrubValue(obj), appScrubValue(obj))
  assert(!edgeScrub(SAMPLES[1]).includes("AE07"))
})

Deno.test("edge log line shape", () => {
  const line = formatEdgeLine("warn", "x for a@b.co", { fn: "hm-public-api", status: 401, ts: "hijack" }, new Date("2026-11-14T00:00:00Z"))
  assertEquals(line, { ts: "2026-11-14T00:00:00.000Z", level: "warn", msg: "x for [email]", source: "edge", fn: "hm-public-api", status: 401 })
})

Deno.test("request id: keeps a sane caller id, else makes one", () => {
  assertEquals(requestIdFor(new Request("https://x", { headers: { "x-request-id": "abc12345-xyz" } })), "abc12345-xyz")
  const made = requestIdFor(new Request("https://x", { headers: { "x-request-id": "bad id with spaces" } }))
  assert(/^[0-9a-f-]{36}$/.test(made))
})

Deno.test("sentry off without DSN, envelope scrubbed with DSN", async () => {
  let called = false
  const fake = (() => { called = true; return Promise.resolve(new Response("ok")) }) as typeof fetch
  assertEquals(await sendToSentry("", { message: "x" }, fake), false)
  assert(!called)
  const env = buildEnvelope(parseDsn("https://k@o1.ingest.sentry.io/12")!, { message: "for a@b.co", eventId: "e".repeat(32), timestamp: "2026-11-14T00:00:00Z" })
  assert(!env.includes("a@b.co"))
})
