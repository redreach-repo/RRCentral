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
// * each key acts as one sales / staff / viewer team member, so the normal
//   row level security rules apply; the service role key is never used for data;
// * no delete tools, nothing on HR, payroll, secrets, settings or users;
//   quotes, invoices and payments are read only; the database also blocks
//   these for AI sessions ("MCP ..." policies);
// * 60 calls a minute per key; every tool call goes to the audit log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.32.2/server/webStandardStreamableHttp.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { memberClient, resolveKey } from "./auth.ts"
import { bearerToken, isMcpKeyShape } from "./highmastMcp.bundle.js"
import { registerTools } from "./tools.ts"

export const SERVER_NAME = "highmast"
export const SERVER_VERSION = "1.0.0"

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
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "HighMast is Red Reach's company system (CRM, deals, support, quotes and invoices). " +
        `You act as ${who.key.memberName} (${who.key.role}) through the key "${who.key.keyName}". ` +
        "Read tools are safe. Write tools only add leads and notes, set follow-ups and move deals forward; " +
        "nothing can be deleted and quotes, invoices and payments are read only. Lists are paginated (limit up to 50, use next_offset).",
    },
  )
  registerTools(server, { db, key: who.key, now: () => new Date() })
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
