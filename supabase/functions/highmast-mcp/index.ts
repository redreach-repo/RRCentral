// HighMast MCP server: lets AI assistants (Grok Bot and others) use HighMast
// as a connector, over the MCP Streamable HTTP transport.
//
//   URL:   https://<project-ref>.supabase.co/functions/v1/highmast-mcp
//   Auth:  Authorization: Bearer hmk_...   (an AI connector key, Admin > AI connector)
//
// Deploy with Verify JWT OFF (supabase/config.toml): the gateway cannot check
// our keys; this function checks every request itself (resolveKey) before any
// tool runs. Stateless: a fresh server per request, JSON answers, no sessions.
//
// Safety, in short (details in README.md next to this file):
// * a standard key acts as one sales / staff / viewer team member, so the normal
//   row level security rules apply; the service role key is never used for data;
// * a key with departments (Sales, Finance, HR ...) acts as an AI admin member
//   but only reaches its departments' tools and tables (checked in the database);
// * no delete tools, nothing on HR, payroll, secrets, settings or users;
//   quotes, invoices and payments are read only; the database also blocks
//   these for AI sessions ("MCP ..." policies);
// * 60 calls a minute per key; every tool call goes to the audit log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.32.2/server/webStandardStreamableHttp.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { memberClient, resolveKey } from "./auth.ts"
import { assistantLabel, bearerToken, departmentsLabel, isMcpKeyShape } from "./highmastMcp.bundle.js"
import { registerTools, type Reach } from "./tools.ts"
import { registerAdminTools } from "./tools_admin.ts"
import { httpRenderer, registerPdfTools, setPdfRenderer } from "./tools_pdf.ts"

export const SERVER_NAME = "highmast"
export const SERVER_VERSION = "1.0.0"

// Fresh PDFs on demand (services/render-pdf on Vercel). Without it the PDF tools
// return the copy saved at the last Download PDF.
const RENDER_PDF_URL = (Deno.env.get("RENDER_PDF_URL") || "").trim()
if (/^https:\/\//.test(RENDER_PDF_URL)) {
  setPdfRenderer(httpRenderer(RENDER_PDF_URL, {
    jwtSecret: Deno.env.get("MCP_JWT_SECRET") || "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
  }))
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
}

function withCors(res: Response, extra: Record<string, string> = {}): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries({ ...CORS, ...extra })) headers.set(k, v)
  headers.set("Cache-Control", "no-store")
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/** A JSON-RPC style error, which MCP clients show to the person. */
function refuse(status: number, message: string, extra: Record<string, string> = {}): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra }
  if (status === 401) headers["WWW-Authenticate"] = 'Bearer realm="highmast-mcp"'
  return withCors(
    new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: status === 429 ? -32029 : -32001, message } }), { status, headers }),
  )
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }))

  // Every request needs a live key. Nothing runs before this check.
  const apiKey = bearerToken(req.headers.get("Authorization"))
  if (!apiKey || !isMcpKeyShape(apiKey)) {
    return refuse(401, "Send Authorization: Bearer <HighMast AI connector key>.")
  }
  const who = await resolveKey(apiKey)
  if (!who.ok) {
    return refuse(who.status, who.error, who.retryAfter ? { "Retry-After": String(who.retryAfter) } : {})
  }

  // Stateless Streamable HTTP: only POST carries messages. No server-sent event stream, no sessions to end.
  if (req.method !== "POST") {
    return refuse(405, "Use POST. This server is stateless and answers each request with JSON.", { Allow: "POST, OPTIONS" })
  }

  const db = await memberClient(who.key)

  // Keys with departments: which tables they reach decides which tools and records they see.
  let reach: Reach | undefined
  if (who.key.scope === "admin") {
    const { data, error } = await db.rpc("rr_mcp_reach")
    if (error) {
      // Only before the departments SQL is run: the key then reaches every area, as admin keys did.
      if (!/rr_mcp_reach|function|schema cache/i.test(error.message || "")) {
        return refuse(503, "Could not check this key's departments. Try again shortly.")
      }
    } else {
      const r = (data || {}) as { departments?: string[]; read?: string[]; write?: string[] }
      reach = { departments: r.departments || [], read: new Set(r.read || []), write: new Set(r.write || []) }
    }
  }
  const depts = departmentsLabel(who.key.departments)
  const assistant = assistantLabel(who.key.assistant)

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "HighMast is Red Reach's company system (CRM, deals, support, quotes and invoices). " +
        `You act as ${who.key.memberName} (${who.key.role}) through the key "${who.key.keyName}"` +
        (assistant ? `, set up for ${assistant}. ` : ". ") +
        (who.key.scope === "admin"
          ? `This key works for these departments only: ${depts || "none"}. You only see their tools and records; ` +
            "anything else is refused by the database, so tell the person to use a key for that department. " +
            "Deletes are soft (restore_record undoes them). " +
            "Sent invoices and recorded payments never change: correct them with create_credit_note or reverse_payment. " +
            "Payroll runs stay draft and leave is never approved by you. Users and settings are read only or hidden. " +
            "Every change is in the audit log with before and after. Confirm with the person before money or HR changes. "
          : "Read tools are safe. Write tools only add leads and notes, set follow-ups and move deals forward; " +
            "nothing can be deleted and quotes, invoices and payments are read only. ") +
        "Lists are paginated (limit up to 50, use next_offset).",
    },
  )
  const ctx = { db, key: who.key, now: () => new Date(), reach }
  registerTools(server, ctx)
  registerAdminTools(server, ctx)
  registerPdfTools(server, ctx)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return withCors(await transport.handleRequest(req))
  } finally {
    // The response body is fully built (JSON mode), so closing here is safe.
    queueMicrotask(() => {
      void transport.close().catch(() => {})
      void server.close().catch(() => {})
    })
  }
}

Deno.serve(withErrorLog("highmast-mcp", handler, { secrets: ["MCP_JWT_SECRET"] }))
