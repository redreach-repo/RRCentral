// Pure helpers for hm-public-api (tested in supabase/tests/functions/hm_public_api_test.ts).

export type Scope = "accounts:read" | "invoices:read" | "quotations:read"

export type Resource = {
  table: string
  scope: Scope
  /** Only these columns ever leave the database. Internal notes, margins and supplier costs stay out. */
  fields: string[]
}

export const RESOURCES: Record<string, Resource> = {
  accounts: {
    table: "accounts",
    scope: "accounts:read",
    fields: ["id", "type", "name", "reference", "industry", "country", "city", "website", "status", "source", "created_at", "updated_at"],
  },
  invoices: {
    table: "invoices",
    scope: "invoices:read",
    fields: [
      "id", "account_id", "client", "reference_number", "date", "description", "amount", "currency",
      "status", "payment_status", "payment_terms", "created_at", "updated_at",
    ],
  },
  quotations: {
    table: "quotations",
    scope: "quotations:read",
    fields: [
      "id", "account_id", "client", "reference_number", "revision", "date", "valid_until", "description",
      "amount", "discount_amount", "currency", "status", "created_at", "updated_at",
    ],
  },
}

export type Route =
  | { kind: "list"; resource: string }
  | { kind: "get"; resource: string; id: string }
  | { kind: "root" }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Accepts /hm-public-api/v1/<resource>[/<id>] or /v1/<resource>[/<id>]. */
export function parseRoute(pathname: string): Route | null {
  const parts = pathname.split("/").filter(Boolean)
  const fnAt = parts.indexOf("hm-public-api")
  const rest = fnAt >= 0 ? parts.slice(fnAt + 1) : parts
  if (rest.length === 0) return { kind: "root" }
  if (rest[0] !== "v1") return null
  if (rest.length === 1) return { kind: "root" }
  const resource = rest[1]
  if (!RESOURCES[resource]) return null
  if (rest.length === 2) return { kind: "list", resource }
  if (rest.length === 3 && UUID_RE.test(rest[2])) return { kind: "get", resource, id: rest[2].toLowerCase() }
  return null
}

/** "Authorization: Bearer hm_<64 hex>" → key, else null. */
export function bearerKey(header: string | null): string | null {
  const m = /^Bearer\s+(hm_[0-9a-f]{64})\s*$/i.exec(header || "")
  return m ? m[1].toLowerCase().replace(/^hm_/i, "hm_") : null
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
}

export type KeyRow = {
  id: string
  tenant_id: string
  scopes: string[] | null
  revoked_at: string | null
  expires_at: string | null
}

/** Why a key cannot be used, or null when it is fine. */
export function keyProblem(row: KeyRow | null, now = new Date()): string | null {
  if (!row) return "invalid_api_key"
  if (row.revoked_at) return "revoked_api_key"
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return "expired_api_key"
  return null
}

export function hasScope(scopes: string[] | null | undefined, resource: string): boolean {
  const r = RESOURCES[resource]
  return !!r && (scopes || []).includes(r.scope)
}

export function clampLimit(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(200, Math.floor(n))
}

export type Cursor = { t: string; id: string }

export function encodeCursor(c: Cursor): string {
  return btoa(JSON.stringify(c)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Returns null for anything that is not a cursor we made (never trust it into a filter). */
export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
    const obj = JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4)))
    if (typeof obj?.t !== "string" || typeof obj?.id !== "string") return null
    if (!UUID_RE.test(obj.id) || Number.isNaN(Date.parse(obj.t))) return null
    return { t: new Date(obj.t).toISOString(), id: obj.id.toLowerCase() }
  } catch {
    return null
  }
}

/** PostgREST `or` filter for rows strictly after the cursor in (created_at desc, id desc) order. */
export function afterCursorFilter(c: Cursor): string {
  return `created_at.lt.${c.t},and(created_at.eq.${c.t},id.lt.${c.id})`
}

/** Fetch limit+1 rows; this splits the page and builds next_cursor. */
export function pageOf<T extends { created_at: string; id: string }>(rows: T[], limit: number) {
  const data = rows.slice(0, limit)
  const last = data[data.length - 1]
  const next_cursor = rows.length > limit && last ? encodeCursor({ t: last.created_at, id: last.id }) : null
  return { data, next_cursor }
}
