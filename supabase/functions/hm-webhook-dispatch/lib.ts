// Pure helpers for hm-webhook-dispatch (tested in supabase/tests/functions/hm_public_api_test.ts).
//
// Signature scheme (documented for receivers in docs/modules/public-api.md):
//   header  HighMast-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
// Receivers recompute the HMAC, compare in constant time, and refuse t older than 5 minutes.

const enc = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function signatureHeader(secret: string, body: string, unixSeconds: number): Promise<string> {
  return `t=${unixSeconds},v1=${await hmacHex(secret, `${unixSeconds}.${body}`)}`
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Reference verifier (what a receiver should do). */
export async function verifySignature(
  secret: string,
  body: string,
  header: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]))
  const t = Number(parts.t)
  if (!Number.isInteger(t) || !parts.v1) return false
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false
  return safeEqual(await hmacHex(secret, `${t}.${body}`), parts.v1)
}

/** 2xx is delivered; anything else (or a network error) is retried by the database backoff. */
export function deliveredOk(status: number): boolean {
  return status >= 200 && status < 300
}

/**
 * Refuse obvious internal targets (SSRF guard): non-https, localhost, and IP
 * literals in private, loopback, link-local or metadata ranges. A hostname
 * that resolves to a private address is not caught here (no DNS lookup).
 */
export function isAllowedTarget(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== "https:") return false
  if (u.username || u.password) return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
  }
  if (host.includes(":")) {
    if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false
  }
  return true
}
