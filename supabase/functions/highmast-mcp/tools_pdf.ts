// PDF tools: get_quote_pdf, get_invoice_pdf, get_delivery_note_pdf.
//
// They hand out the SAME PDF a person gets from Download PDF in HighMast:
// the app saves that file in the private Storage bucket "generated-pdfs"
// (app/src/lib/generatedPdfs.ts). When the renderer is set up (RENDER_PDF_URL,
// services/render-pdf on Vercel), the tool first has it open the document in
// the app (/render-pdf/...) and run the same Download PDF code, so the file is
// fresh; otherwise, or if the renderer fails, it returns the copy saved at the
// last download and says when that was.
//
// Read only: nothing changes status, marks anything sent or emails anyone.
// Access: the document is read as the key's member (row level security and,
// for keys with departments, the department rules), and the Storage rules only
// let a key read a PDF of a document it can see. Only 1 hour signed links go
// out. Each call is in the audit log like every tool (runTool).
import type { McpServer } from "npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js"
import { z } from "npm:zod@3.25.76"
import { sessionClaims, signJwt, type McpKey } from "./auth.ts"
import { check, runTool, toolOffered, ToolError, type Row, type ToolContext, type ToolDef } from "./tools.ts"
import {
  GENERATED_PDF_BUCKET,
  GENERATED_PDF_LINK_SECONDS,
  generatedPdfPath,
  quotePdfNumber,
} from "./highmastMcp.bundle.js"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMBER_RE = /^[A-Za-z0-9._-]{1,80}$/

type Kind = "quote" | "invoice" | "delivery-note"
const KINDS: Record<Kind, { table: string; label: string; idArg: string; numberArg: string; numberCols: string[] }> = {
  quote: { table: "quotations", label: "quote", idArg: "quote_id", numberArg: "quote_number", numberCols: ["reference_number", "quote_id"] },
  invoice: { table: "invoices", label: "invoice", idArg: "invoice_id", numberArg: "invoice_number", numberCols: ["reference_number"] },
  "delivery-note": { table: "delivery_notes", label: "delivery note", idArg: "delivery_note_id", numberArg: "delivery_note_number", numberCols: ["reference_number"] },
}

/** Renders a document's PDF with the app's own Download PDF code. Set by index.ts when a renderer is configured. */
export type PdfRenderer = (kind: Kind, id: string, ctx: ToolContext) => Promise<void>

/** Find the document by id or number, as the key's member. Soft deleted documents are refused. */
export async function findDocument(ctx: ToolContext, kind: Kind, args: Row): Promise<Row> {
  const k = KINDS[kind]
  const id = args[k.idArg] == null ? "" : String(args[k.idArg]).trim()
  const number = args[k.numberArg] == null ? "" : String(args[k.numberArg]).trim()
  if (!id && !number) throw new ToolError(`Send ${k.idArg} or ${k.numberArg}.`)
  if (id && !UUID_RE.test(id)) throw new ToolError(`${k.idArg} must be a UUID.`)
  if (number && !NUMBER_RE.test(number)) throw new ToolError(`${k.numberArg} looks wrong (e.g. RR-01-26007).`)
  let rows: Row[] = []
  if (id) {
    rows = (check(await ctx.db.from(k.table).select("*").eq("id", id).limit(1), `read the ${k.label}`) as Row[] | null) || []
  } else {
    for (const col of k.numberCols) {
      rows = (check(await ctx.db.from(k.table).select("*").eq(col, number).limit(2), `read the ${k.label}`) as Row[] | null) || []
      if (rows.length) break
    }
  }
  if (rows.length > 1) throw new ToolError(`More than one ${k.label} has the number ${number}; send ${k.idArg} instead.`)
  const row = rows[0]
  if (!row) throw new ToolError(`No ${k.label} ${id || number} (or not visible to this key).`)
  if (row.deleted_at) throw new ToolError(`${k.label[0].toUpperCase() + k.label.slice(1)} ${id || number} is deleted. Restore it first if you need its PDF.`)
  return row
}

function docNumber(kind: Kind, row: Row): string {
  return kind === "quote" ? quotePdfNumber(row as { reference_number?: string; quote_id?: string }) : String(row.reference_number || "")
}

type StoredInfo = { size_bytes: number; generated_at: string | null }

async function storedInfo(ctx: ToolContext, path: string): Promise<StoredInfo | null> {
  const folder = path.slice(0, path.indexOf("/"))
  const file = path.slice(path.indexOf("/") + 1)
  // deno-lint-ignore no-explicit-any
  const storage = (ctx.db as any).storage
  if (!storage) throw new ToolError("PDF storage is not available.")
  const { data, error } = await storage.from(GENERATED_PDF_BUCKET).list(folder, { search: file, limit: 10 })
  if (error) {
    if (/not found|bucket/i.test(error.message || "")) throw new ToolError("The generated-pdfs bucket is not set up yet (run the PDF SQL).")
    throw new ToolError(`Could not look up the PDF: ${error.message}`)
  }
  const hit = ((data || []) as { name: string; updated_at?: string; created_at?: string; metadata?: { size?: number } }[])
    .find((f) => f.name === file)
  if (!hit) return null
  return { size_bytes: Number(hit.metadata?.size || 0), generated_at: hit.updated_at || hit.created_at || null }
}

async function signedUrl(ctx: ToolContext, path: string): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const { data, error } = await (ctx.db as any).storage.from(GENERATED_PDF_BUCKET).createSignedUrl(path, GENERATED_PDF_LINK_SECONDS)
  if (error || !data?.signedUrl) throw new ToolError(`Could not make a link to the PDF${error?.message ? `: ${error.message}` : ""}.`)
  return String(data.signedUrl)
}

let renderer: PdfRenderer | null = null
export function setPdfRenderer(r: PdfRenderer | null) {
  renderer = r
}

/** How long the renderer's login lasts. */
export const RENDER_LOGIN_SECONDS = 120

/**
 * The renderer's login: the key's member, as an AI session (hm_mcp_key) that is
 * also marked hm_pdf_render = "<kind>:<id>". The database lets it read only the
 * document page's tables and write nothing but the PDF file.
 */
export function renderClaims(key: McpKey, kind: Kind, id: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  return { ...sessionClaims(key, nowSeconds), exp: nowSeconds + RENDER_LOGIN_SECONDS, hm_pdf_render: `${kind}:${id}` }
}

/**
 * The Vercel renderer (services/render-pdf): it opens /render-pdf/<kind>/<id> in
 * HighMast in a headless browser, which runs the app's own Download PDF code and
 * saves the file. Set up when the RENDER_PDF_URL secret is present.
 */
export function httpRenderer(
  url: string,
  opts: { jwtSecret: string; anonKey: string; fetcher?: typeof fetch; timeoutMs?: number },
): PdfRenderer {
  const fetcher = opts.fetcher || fetch
  return async (kind, id, ctx) => {
    const token = await signJwt(renderClaims(ctx.key, kind, id), opts.jwtSecret)
    let res: Response
    try {
      res = await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id, token, apikey: opts.anonKey }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 70_000),
      })
    } catch (e) {
      throw new ToolError(`The PDF renderer did not answer (${e instanceof Error ? e.message : String(e)}).`)
    }
    const out = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !out?.ok) {
      throw new ToolError(`The PDF renderer could not make the PDF: ${out?.error || `HTTP ${res.status}`}`)
    }
  }
}

async function getPdf(ctx: ToolContext, kind: Kind, args: Row) {
  const k = KINDS[kind]
  const row = await findDocument(ctx, kind, args)
  const number = docNumber(kind, row)
  const path = generatedPdfPath(kind, number)
  if (!path) throw new ToolError(`This ${k.label} has no number a PDF can be filed under.`)
  let rendered = false
  let renderError = ""
  if (renderer) {
    try {
      await renderer(kind, String(row.id), ctx)
      rendered = true
    } catch (e) {
      renderError = e instanceof Error ? e.message : String(e)
    }
  }
  const info = await storedInfo(ctx, path)
  if (!info) {
    throw new ToolError(
      renderError
        ? `${renderError} No earlier copy of ${k.label} ${number} is saved either.`
        : `No PDF of ${k.label} ${number} has been made yet. Open it in HighMast and click Download PDF once; ` +
          "after that this tool returns that exact file.",
    )
  }
  const changedAfter = !rendered && info.generated_at && row.updated_at && String(row.updated_at) > info.generated_at
  return {
    [k.idArg]: row.id,
    [k.numberArg]: number,
    status: row.status ?? null,
    file_name: path.slice(path.indexOf("/") + 1),
    signed_url: await signedUrl(ctx, path),
    expires_in_seconds: GENERATED_PDF_LINK_SECONDS,
    size_bytes: info.size_bytes,
    generated_at: info.generated_at,
    source: rendered ? "rendered now with the app's Download PDF" : "saved by the app's Download PDF",
    ...(renderError
      ? { warning: `${renderError} This is the copy saved at the last Download PDF${changedAfter ? `, and the ${k.label} has changed since` : ""}.` }
      : changedAfter
        ? { warning: `The ${k.label} was changed after this PDF was made. Click Download PDF in HighMast again for an up to date copy.` }
        : {}),
  }
}

const idOrNumber = (k: (typeof KINDS)[Kind], example: string) => ({
  [k.idArg]: z.string().regex(UUID_RE, "must be a UUID").optional().describe(`The ${k.label}'s id.`),
  [k.numberArg]: z.string().regex(NUMBER_RE).max(80).optional().describe(`Or its number, e.g. "${example}".`),
})

const R = (name: string, title: string, description: string, input: z.ZodRawShape, run: ToolDef["run"]): ToolDef =>
  ({ name, title, description, input, readOnly: true, run })

export const PDF_TOOLS: ToolDef[] = [
  R("get_quote_pdf", "Quote PDF",
    "The quote's PDF, exactly as Download PDF makes it in HighMast (logo, company details, TRN, lines, VAT, totals, terms, bank details, signature). Send quote_id or quote_number. Returns file_name, a private signed_url that works for 1 hour, size_bytes and generated_at. Read only: does not change, send or email anything.",
    idOrNumber(KINDS.quote, "RR-01-26007"),
    (a, ctx) => getPdf(ctx, "quote", a)),
  R("get_invoice_pdf", "Invoice PDF",
    "The invoice's (or credit note's) PDF, exactly as Download PDF makes it in HighMast. Send invoice_id or invoice_number. Returns file_name, a private signed_url that works for 1 hour, size_bytes and generated_at. Read only: does not change, send or email anything.",
    idOrNumber(KINDS.invoice, "RR-01-26007"),
    (a, ctx) => getPdf(ctx, "invoice", a)),
  R("get_delivery_note_pdf", "Delivery note PDF",
    "The delivery note's PDF, exactly as Download PDF makes it in HighMast. Send delivery_note_id or delivery_note_number. Returns file_name, a private signed_url that works for 1 hour, size_bytes and generated_at. Read only.",
    idOrNumber(KINDS["delivery-note"], "DN-01-26001"),
    (a, ctx) => getPdf(ctx, "delivery-note", a)),
]

export function registerPdfTools(server: McpServer, ctx: ToolContext) {
  for (const def of PDF_TOOLS) {
    if (!toolOffered(def.name, ctx)) continue
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      // deno-lint-ignore no-explicit-any
      ((args: Record<string, unknown>) => runTool(def, args || {}, ctx)) as any,
    )
  }
}
