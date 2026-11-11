// Remote MCP for Ask RR — Claude Desktop / claude.ai / Claude iPhone.
// Auth: Authorization Bearer must match ASK_RR_MCP_TOKEN (or x-ask-rr-token).
// Claude connector also needs the Supabase anon key as `apikey` (API gateway).
//
// Deploy: Actions → Deploy Edge Functions → ask-rr-mcp
// Secret: ASK_RR_MCP_TOKEN (long random string) + ANTHROPIC_API_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.132.0"
import { createMcpHandler, McpServer } from "npm:@modelcontextprotocol/server@^2.0.0"
import { z } from "npm:zod@^4.3.6"
import {
  AI_MODEL,
  aiCostUsd,
  buildAiRequest,
  parseCrmAskAnswer,
} from "../ai-assist/aiAssist.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"

const VAT = 0.05

function env(name: string): string {
  return Deno.env.get(name) || ""
}

function providedToken(req: Request): string {
  const header = (req.headers.get("x-ask-rr-token") || "").trim()
  if (header) return header
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="ask-rr-mcp"',
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-ask-rr-token, apikey, content-type, accept, mcp-session-id, mcp-protocol-version",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    },
  })
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

function matchClient(have: string, want: string): boolean {
  const a = have.trim().toLowerCase()
  const b = want.trim().toLowerCase()
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

function compactFacts(rows: Array<Record<string, unknown>>, limit = 60): string[] {
  const open = rows.filter((r) => {
    const s = String(r.pipeline_stage || "Lead")
    return s !== "Won" && s !== "Lost"
  })
  const facts = [`Open deals: ${open.length} (of ${rows.length} CRM companies)`]
  for (const r of open.slice(0, limit)) {
    facts.push(
      [
        String(r.company_name || "Unnamed"),
        `stage ${r.pipeline_stage || "Lead"}`,
        r.owner ? `owner ${r.owner}` : "unassigned",
        r.follow_up_date ? `follow-up ${String(r.follow_up_date).slice(0, 10)}` : "no follow-up date",
        r.next_action ? `next: ${r.next_action}` : "no next action",
        r.quote_ref ? `quote ${r.quote_ref}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    )
  }
  return facts
}

function quoteFacts(rows: Array<Record<string, unknown>>, limit = 40): string[] {
  return rows.slice(0, limit).map((q) => {
    const ref = String(q.reference_number || "").trim() || "DRAFT"
    return `Quote ${ref} · ${q.client || ""} · ${q.status || ""} · AED ${Number(q.amount) || 0} · ${String(q.date || "").slice(0, 10)}`
  })
}

function pickQuotesForQuestion(rows: Array<Record<string, unknown>>, question: string, limit = 6) {
  const q = question.trim().toLowerCase()
  if (!q || !rows.length || limit <= 0) return [] as Array<Record<string, unknown>>
  const matched = rows.filter((row) => {
    const client = String(row.client || "").trim().toLowerCase()
    if (!client) return false
    if (q.includes(client) || client.includes(q)) return true
    return client.split(/[^a-z0-9]+/).filter((t) => t.length >= 4).some((t) => q.includes(t))
  })
  const pool = matched.length ? matched : rows.slice(0, Math.min(limit, 3))
  return pool.slice(0, limit)
}

async function lineFactsForQuestion(
  db: ReturnType<typeof createClient>,
  quotes: Array<Record<string, unknown>>,
  question: string,
): Promise<string[]> {
  const picked = pickQuotesForQuestion(quotes, question, 6)
  const out: string[] = []
  for (const quote of picked) {
    const quoteId = String(quote.quote_id || "").trim()
    const ref = String(quote.reference_number || "").trim() || "DRAFT"
    const client = String(quote.client || "").trim() || "client"
    if (!quoteId) continue
    const { data, error } = await db
      .from("line_items")
      .select("description, sku, qty, unit_price, amount")
      .eq("doc_type", "Quote")
      .eq("reference", quoteId)
      .order("line_no", { ascending: true })
      .limit(25)
    if (error) continue
    const rows = data || []
    if (!rows.length) {
      out.push(`Quote ${ref} · ${client}: no line items on file`)
      continue
    }
    for (const item of rows) {
      const desc = String(item.description || item.sku || "item").replace(/\s+/g, " ").trim()
      const qty = Number(item.qty) || 0
      const unit = Number(item.unit_price) || 0
      const amount = Number(item.amount) || qty * unit
      out.push(`Quote ${ref} · ${client} · ${desc} · qty ${qty} · unit AED ${unit} · amount AED ${amount}`)
    }
  }
  return out
}

Deno.serve(withErrorLog("ask-rr-mcp", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-ask-rr-token, apikey, content-type, accept, mcp-session-id, mcp-protocol-version",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      },
    })
  }

  const expected = env("ASK_RR_MCP_TOKEN")
  const provided = providedToken(req)
  // Shared secret gate: Claude connector sends this Bearer / x-ask-rr-token on every call.
  if (!expected || provided !== expected) return unauthorized()

  const supabaseUrl = env("SUPABASE_URL")
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY")
  const apiKey = env("ANTHROPIC_API_KEY")
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 })
  }
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not set" }), { status: 503 })
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "ask-rr", version: "1.0.0" })

    server.registerTool(
      "ask_rr",
      {
        title: "Ask RR",
        description:
          "Ask about Red Reach CRM pipeline, follow-ups, and whether a quotation exists. Returns a reply and may suggest a draft quote (not saved until create_draft_quotation).",
        inputSchema: z.object({
          question: z.string().describe("The salesperson's question"),
          asker_name: z.string().optional().describe("Who is asking"),
        }),
      },
      async ({ question, asker_name }) => {
        const [{ data: crm }, { data: quotes }] = await Promise.all([
          db.from("crm").select("*").order("updated_at", { ascending: false }).limit(400),
          db.from("quotations").select("*").order("created_at", { ascending: false }).limit(80),
        ])
        const quoteRows = (quotes || []) as Array<Record<string, unknown>>
        const facts = [
          ...compactFacts((crm || []) as Array<Record<string, unknown>>),
          ...quoteFacts(quoteRows),
          ...(await lineFactsForQuestion(db, quoteRows, question)),
        ]
        if (!facts.length) return textResult("No CRM facts loaded.")

        const input = {
          feature: "crm_ask" as const,
          askerName: asker_name || "Claude",
          question,
          facts,
        }
        const request = buildAiRequest(input)
        if (!request.schema) return textResult("Ask RR schema missing.")
        const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
        const message = await client.messages.create({
          model: AI_MODEL,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          thinking: { type: "disabled" },
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: request.schema },
          },
        })
        const costUsd = aiCostUsd(message.usage)
        await db.from("ai_usage_log").insert({
          account_id: null,
          feature: "crm_ask",
          model: message.model || AI_MODEL,
          input_tokens: message.usage.input_tokens || 0,
          output_tokens: message.usage.output_tokens || 0,
          cost_usd: costUsd,
          created_by: "ask-rr-mcp",
        })
        let text = ""
        for (const block of message.content) {
          if (block.type === "text") text += block.text
        }
        const parsed = parseCrmAskAnswer(text)
        const payload = {
          reply: parsed.reply,
          quote_lookup_client: parsed.quoteLookupClient,
          quote_draft: parsed.quoteDraft,
          cost_usd: costUsd,
          tip:
            parsed.quoteDraft
              ? "Draft is proposed only. Call create_draft_quotation with these fields to save a Draft in RR Central."
              : parsed.quoteLookupClient
                ? "Call find_quotations with this client name to get deep links."
                : undefined,
        }
        return textResult(JSON.stringify(payload, null, 2))
      },
    )

    server.registerTool(
      "find_quotations",
      {
        title: "Find quotations",
        description: "Find existing quotations for a company name (partial match).",
        inputSchema: z.object({
          client: z.string().describe("Company / client name to search"),
          limit: z.number().optional().describe("Max rows (default 12)"),
        }),
      },
      async ({ client, limit }) => {
        const { data, error } = await db
          .from("quotations")
          .select("id, quote_id, client, status, amount, date, reference_number, created_at")
          .order("created_at", { ascending: false })
          .limit(120)
        if (error) return textResult(`Lookup failed: ${error.message}`)
        const hits = ((data || []) as Array<Record<string, unknown>>)
          .filter((q) => matchClient(String(q.client || ""), client))
          .slice(0, Math.min(40, Math.max(1, Number(limit) || 12)))
          .map((q) => ({
            id: q.id,
            quote_id: q.quote_id,
            client: q.client,
            status: q.status,
            amount: q.amount,
            date: q.date,
            reference: q.reference_number || "DRAFT",
            path: `/document/quote/${q.id}`,
            app_url: `https://redreach-repo.github.io/RRCentral/document/quote/${q.id}`,
          }))
        if (!hits.length) return textResult(`No quotations found for ${client}.`)
        return textResult(JSON.stringify({ count: hits.length, quotations: hits }, null, 2))
      },
    )

    server.registerTool(
      "create_draft_quotation",
      {
        title: "Create draft quotation",
        description:
          "Save a Draft quotation in RR Central (never Finalized). Prefer numbers the salesperson stated. unit_cost may be 0.",
        inputSchema: z.object({
          client: z.string(),
          division_code: z.string().optional().describe("01 Threads default, 02 Wanders, …"),
          description: z.string().optional(),
          notes: z.string().optional(),
          items: z
            .array(
              z.object({
                description: z.string(),
                qty: z.number(),
                unit_price: z.number(),
                unit_cost: z.number().optional(),
              }),
            )
            .min(1),
        }),
      },
      async ({ client, division_code, description, notes, items }) => {
        const division = /^0[1-6]$/.test(String(division_code || "").trim())
          ? String(division_code).trim()
          : "01"
        const brandByCode: Record<string, string> = {
          "01": "Threads",
          "02": "Wanders",
          "03": "Marketing",
          "04": "Connect",
          "05": "Care",
          "06": "Trading",
        }
        const lines = items
          .map((i) => ({
            description: String(i.description || "").trim(),
            qty: Number(i.qty) || 0,
            unit_price: Number(i.unit_price) || 0,
            unit_cost: Math.max(0, Number(i.unit_cost) || 0),
          }))
          .filter((i) => i.description && i.qty > 0 && i.unit_price >= 0)
        if (!client.trim() || !lines.length) {
          return textResult("Need a client and at least one line with qty and unit_price.")
        }
        let subtotal = 0
        for (const line of lines) subtotal += line.qty * line.unit_price
        const total = Math.round((subtotal * (1 + VAT) + Number.EPSILON) * 100) / 100
        const quoteId = `Q-${Date.now()}`
        const today = new Date().toISOString().slice(0, 10)
        const insertRow: Record<string, unknown> = {
          client: client.trim(),
          vertical: brandByCode[division] || "Threads",
          division_code: division,
          description: (description || "").trim() || `Quotation for ${client.trim()}`,
          notes: (notes || "").trim(),
          payment_terms: "",
          delivery_terms: "",
          moq: "",
          date: today,
          amount: total,
          discount_percent: 0,
          discount_amount: 0,
          offset_vat: false,
          quote_id: quoteId,
          status: "Draft",
          reference_number: "",
          base_reference: "",
          revision: 0,
          currency: "AED",
          quotation_currency: "AED",
          payment_currency: "AED",
          supplier_currency: "AED",
          booking_currency: "AED",
          fx_rate: 1,
          base_amount: total,
          fx_rate_approved_by: "ask-rr-mcp",
          fx_rate_approved_at: new Date().toISOString(),
          created_by: "ask-rr-mcp",
          updated_by: "ask-rr-mcp",
          updated_at: new Date().toISOString(),
        }
        let { error } = await db.from("quotations").insert(insertRow)
        if (error) {
          const { offset_vat: _o, ...withoutFlag } = insertRow
          const retry = await db.from("quotations").insert(withoutFlag)
          error = retry.error
        }
        if (error) return textResult(`Could not save draft: ${error.message}`)

        const lineRows = lines.map((line, idx) => {
          const amount = Math.round(line.qty * line.unit_price * 100) / 100
          const vat_amount = Math.round(amount * VAT * 100) / 100
          return {
            doc_type: "Quote",
            reference: quoteId,
            line_no: idx + 1,
            description: line.description,
            qty: line.qty,
            unit_price: line.unit_price,
            unit_cost: line.unit_cost,
            vat_rate: VAT,
            amount,
            vat_amount,
            line_total: Math.round((amount + vat_amount) * 100) / 100,
            remarks: "",
            sku: "",
          }
        })
        const { error: lineErr } = await db.from("line_items").insert(lineRows)
        if (lineErr) {
          // Quote header exists; surface line failure clearly
          return textResult(
            `Draft ${quoteId} saved for ${client.trim()} (${total} AED) but line items failed: ${lineErr.message}`,
          )
        }

        const found = await db.from("quotations").select("id").eq("quote_id", quoteId).maybeSingle()
        const rowId = found.data?.id ? String(found.data.id) : null
        return textResult(
          JSON.stringify(
            {
              ok: true,
              quote_id: quoteId,
              row_id: rowId,
              client: client.trim(),
              amount: total,
              status: "Draft",
              app_url: rowId
                ? `https://redreach-repo.github.io/RRCentral/document/quote/${rowId}`
                : "https://redreach-repo.github.io/RRCentral/quotations",
            },
            null,
            2,
          ),
        )
      },
    )

    return server
  })

  return handler.fetch(req)
}, { secrets: ["ASK_RR_MCP_TOKEN", "ANTHROPIC_API_KEY"] }))
