// Client POs: read an uploaded PO with AI, and file it in Google Drive.
//
//   POST { action: "status" }                               admin, manager, sales
//        -> { reader: bool, drive: bool }  (what is set up, so the page can say what is missing)
//   POST { action: "read", filename, content_base64, content_type }
//        -> { po, warnings, costUsd }      (nothing is saved; the page fills in the form)
//   POST { action: "file", client_id, po_number, quote_ref?, filename, content_base64, content_type }
//        -> { id, url, folder_url }        (into RR Central / Customers / <client>)
//   POST { action: "relabel", po_id }
//        -> { id, name }                   (renames the filed PO to "PO <no> - Quote <ref> - <file>"
//                                           after its quotation is linked; read as the user)
//
// The two steps are separate on purpose: reading works without Google Drive,
// and filing works without the AI key, so a missing setup step only switches
// off its own half. The person always checks the details before saving.
//
// The file checks, prompt, schema and clean up are in app/src/lib/clientPoReader.ts (bundled).
// Secrets: ANTHROPIC_API_KEY (reading); GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
// and Google Drive connected in Settings (filing).
// Deploy: Actions > Deploy Edge Functions > client-po-file (verify_jwt = false in supabase/config.toml).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.132.0"
import {
  PO_READER_MODEL,
  PO_READER_SYSTEM,
  PO_SCHEMA,
  parseExtractedPo,
  poDriveFilename,
  poFileProblem,
  poIsEmpty,
  poReaderContent,
  poReaderCostUsd,
  poTotalsWarnings,
} from "./clientPoReader.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import {
  type DriveConnection,
  type DriveSaved,
  accessToken,
  createFolder,
  driveFolderId,
  folderUrl,
  folderUsable,
  googleApp,
  loadConnection,
  safeName,
  uploadFile,
} from "../_shared/googleDrive.ts"
import { serviceRoleKey, publicApiKey } from "../_shared/supabaseKeys.ts"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  return raw ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean) : DEFAULT_ORIGINS
}

function corsHeadersFor(req: Request): Record<string, string> {
  const allowed = allowedOrigins()
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Renames a PO already filed in Google Drive so its name carries the linked
 * quotation number. Everything comes from the PO row as the user can see it
 * (row level security), never from the request: only the PO id is sent.
 */
async function relabel(
  sb: SupabaseClient,
  userDb: SupabaseClient,
  body: Record<string, unknown>,
  json: (b: unknown, status?: number) => Response,
): Promise<Response> {
  const app = googleApp()
  if (!app) return json({ error: "Google Drive is not set up yet.", setup: "drive" }, 503)
  const conn = await loadConnection(sb)
  if (!conn) return json({ error: "Google Drive is not connected yet.", setup: "drive" }, 503)
  const poId = typeof body.po_id === "string" && UUID.test(body.po_id) ? body.po_id : ""
  if (!poId) return json({ error: "Which PO?" }, 400)
  const { data: po } = await userDb
    .from("client_purchase_orders")
    .select("id, po_number, file_name, drive_file_id, quote_reference")
    .eq("id", poId)
    .maybeSingle()
  if (!po) return json({ error: "Client PO not found" }, 404)
  const row = po as { po_number: string; file_name: string; drive_file_id: string; quote_reference: string }
  if (!row.drive_file_id || !/^[A-Za-z0-9_-]{10,200}$/.test(row.drive_file_id)) {
    return json({ error: "This PO has no file in Google Drive" }, 400)
  }
  const name = safeName(poDriveFilename(row.po_number, row.file_name || "po.pdf", row.quote_reference || ""))
  const token = await accessToken(app, conn.refresh_token)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.drive_file_id)}?supportsAllDrives=true&fields=id,name`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        name,
        description: row.quote_reference ? `Client PO ${row.po_number} for quotation ${row.quote_reference}` : `Client PO ${row.po_number}`,
      }),
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160)
    console.error("client-po-file relabel", res.status, detail)
    return json({ error: `Google Drive did not rename the file (${res.status})` }, 502)
  }
  await res.body?.cancel()
  return json({ id: row.drive_file_id, name })
}

function decodeBase64(content: string): Uint8Array {
  const bin = atob(content)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * The client's Drive folder: the one saved on the client, else the folder the
 * CRM already made for a company with the same name, else a new one under
 * RR Central / Customers. Saved on the client so later POs land in the same place.
 */
async function ensureClientsFolder(
  sb: SupabaseClient,
  token: string,
  conn: DriveConnection,
  client: { id: string; company_name: string; drive_folder_url?: string | null },
): Promise<DriveSaved> {
  const own = driveFolderId(client.drive_folder_url || "")
  if (own && (await folderUsable(token, own))) return { id: own, url: client.drive_folder_url || folderUrl(own) }

  let found: DriveSaved | null = null
  const { data: crmRows } = await sb
    .from("crm")
    .select("drive_folder_url")
    .ilike("company_name", client.company_name.replace(/[\\%_]/g, "\\$&"))
    .neq("drive_folder_url", "")
    .limit(3)
  for (const row of (crmRows || []) as { drive_folder_url: string }[]) {
    const id = driveFolderId(row.drive_folder_url)
    if (id && (await folderUsable(token, id))) {
      found = { id, url: row.drive_folder_url }
      break
    }
  }
  if (!found) {
    if (!conn.customers_folder_id) throw new Error("Connect Google Drive again in Settings so RR Central can make its Customers folder")
    found = await createFolder(token, safeName(client.company_name, "Client"), conn.customers_folder_id)
  }
  await sb.from("clients").update({ drive_folder_url: found.url }).eq("id", client.id)
  return found
}

Deno.serve(withErrorLog("client-po-file", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const origin = req.headers.get("Origin")
  if (origin && !allowedOrigins().includes(origin)) return json({ error: "Origin not allowed" }, 403)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = publicApiKey() || ""
  const serviceKey = serviceRoleKey() || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Verify JWT is off for this function, so check the signed in user here, before anything else.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  // Same people who can see and save client POs (admin, manager, sales).
  const { data: isStaff } = await userDb.rpc("rr_is_staff")
  if (isStaff !== true) return json({ error: "Your role cannot add client POs" }, 403)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || ""
  const app = googleApp()

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || "status")

  if (action === "status") {
    const conn = app ? await loadConnection(sb) : null
    return json({ reader: Boolean(apiKey), drive: Boolean(app && conn) })
  }
  if (action === "relabel") return await relabel(sb, userDb, body, json)
  if (action !== "read" && action !== "file") return json({ error: "Unknown action" }, 400)

  const filename = String(body.filename || "").trim().slice(0, 200)
  const contentType = String(body.content_type || "").toLowerCase().slice(0, 100)
  const content = typeof body.content_base64 === "string" ? body.content_base64.replace(/\s/g, "") : ""
  if (!filename) return json({ error: "The file needs a name" }, 400)
  if (!content || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) return json({ error: "The file could not be read" }, 400)
  const problem = poFileProblem(contentType, Math.floor((content.length * 3) / 4))
  if (problem) return json({ error: problem }, 400)

  if (action === "read") {
    if (!apiKey) {
      return json({ error: "Reading POs is not set up yet. Add the ANTHROPIC_API_KEY secret in Supabase.", setup: "reader" }, 503)
    }
    const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
    let message: Anthropic.Message
    try {
      message = await client.messages.create({
        model: PO_READER_MODEL,
        max_tokens: 16000,
        system: PO_READER_SYSTEM,
        // deno-lint-ignore no-explicit-any
        messages: [{ role: "user", content: poReaderContent(contentType, content) as any }],
        output_config: { effort: "low", format: { type: "json_schema", schema: PO_SCHEMA } },
      })
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        return json({ error: "The Anthropic API key was refused. Check the ANTHROPIC_API_KEY secret.", setup: "reader" }, 502)
      }
      if (e instanceof Anthropic.RateLimitError) return json({ error: "PO reading is busy. Please try again in a minute." }, 429)
      if (e instanceof Anthropic.APIError) {
        const detail = String(e.message || "").replace(/\s+/g, " ").trim().slice(0, 180)
        console.error("client-po-file Anthropic APIError", e.status, detail)
        return json({ error: detail ? `Could not read the PO (${e.status || "error"}): ${detail}` : "Could not read the PO. Please try again." }, 502)
      }
      console.error("client-po-file Anthropic unreachable", e instanceof Error ? e.message : e)
      return json({ error: "PO reading could not be reached. Please try again." }, 502)
    }
    const costUsd = poReaderCostUsd(message.usage)
    console.log(JSON.stringify({ fn: "client-po-file", read: true, by: who.user.email, costUsd }))
    if (message.stop_reason === "refusal") return json({ error: "This file could not be read. Fill in the PO by hand." }, 422)
    if (message.stop_reason === "max_tokens") return json({ error: "The PO is too long to read in one go. Fill in the rest by hand." }, 422)
    let text = ""
    for (const block of message.content) if (block.type === "text") text += block.text
    const po = parseExtractedPo(text)
    if (poIsEmpty(po)) return json({ error: "No PO details were found in this file. Check it is the PO, or fill it in by hand." }, 422)
    return json({ po, warnings: poTotalsWarnings(po), costUsd })
  }

  // action === "file"
  if (!app) return json({ error: "Google Drive is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Supabase.", setup: "drive" }, 503)
  const conn = await loadConnection(sb)
  if (!conn) return json({ error: "Google Drive is not connected yet. An admin connects it in Settings.", setup: "drive" }, 503)
  const clientId = typeof body.client_id === "string" && UUID.test(body.client_id) ? body.client_id : ""
  if (!clientId) return json({ error: "Pick the client first" }, 400)
  // Read the client as the user, so they only reach clients they can see.
  const { data: client } = await userDb.from("clients").select("id, company_name, drive_folder_url").eq("id", clientId).maybeSingle()
  if (!client) return json({ error: "Client not found" }, 404)

  const token = await accessToken(app, conn.refresh_token)
  const folder = await ensureClientsFolder(sb, token, conn, client as { id: string; company_name: string; drive_folder_url: string })
  const saved = await uploadFile(token, {
    folderId: folder.id,
    filename: poDriveFilename(String(body.po_number || ""), filename, String(body.quote_ref || "").slice(0, 60)),
    contentType,
    bytes: decodeBase64(content),
  })
  return json({ id: saved.id, url: saved.url, folder_url: folder.url })
}, { secrets: ["ANTHROPIC_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] }))
