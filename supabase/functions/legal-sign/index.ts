// Legal document e-sign (NDA): client opens a private link, reads the PDF,
// draws a signature, and signs. Deploy with Verify JWT OFF
// (supabase/config.toml): the link token is the only key.
//
//   POST { token }                         document headline
//   POST { token, action: "pdf" }          unsigned PDF as sent
//   POST { token, action: "sign", name, date, agreed: true, signature_png }
//
// On sign: stamps a signature page onto the PDF (pdf-lib), marks the vault
// row signed, and files the PDF to the client's Google Drive folder +
// customer_documents when Drive is connected.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1"
import {
  defaultObligationsOnSign,
  hashLegalSignToken,
  isLegalSignToken,
  legalDocLabel,
  legalSignLinkState,
  legalSignView,
  signProblem,
} from "./legalDocuments.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { driveUploader } from "../_shared/googleDrive.ts"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function corsHeadersFor(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  const allowed = raw ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean) : DEFAULT_ORIGINS
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const NOT_VALID = "This link does not work any more. Ask Red Reach for a new one."

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function pngDataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) return null
  try {
    return b64ToBytes(m[1])
  } catch {
    return null
  }
}

async function stampSignedPdf(
  unsignedB64: string,
  opts: { name: string; date: string; signaturePng: string; title: string },
): Promise<string> {
  const pdf = await PDFDocument.load(b64ToBytes(unsignedB64))
  const page = pdf.addPage([595.28, 841.89]) // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let y = 780
  page.drawText("Electronic signature", { x: 50, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) })
  y -= 28
  page.drawText(`Document: ${opts.title.slice(0, 80)}`, { x: 50, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) })
  y -= 18
  page.drawText(`Signed by: ${opts.name.slice(0, 80)}`, { x: 50, y, size: 11, font })
  y -= 18
  page.drawText(`Date: ${opts.date}`, { x: 50, y, size: 11, font })
  y -= 18
  page.drawText("The signer drew the signature below and confirmed agreement in RR Central.", {
    x: 50,
    y,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  })
  y -= 30
  const png = pngDataUrlToBytes(opts.signaturePng)
  if (png) {
    try {
      const img = await pdf.embedPng(png)
      const w = Math.min(280, img.width)
      const h = (img.height / img.width) * w
      page.drawImage(img, { x: 50, y: y - h, width: w, height: h })
    } catch {
      page.drawText("(Signature image could not be embedded.)", { x: 50, y, size: 10, font })
    }
  }
  return bytesToB64(await pdf.save())
}

type LinkRow = {
  id: string
  legal_document_id: string
  expires_at: string | null
  revoked_at: string | null
  last_opened_at: string | null
  signed_at: string | null
  signed_name: string
}

type DocRow = {
  id: string
  company_name: string
  crm_id: string
  doc_type: string
  title: string
  status: string
  party_name: string
  party_email: string
  party_company: string
}

Deno.serve(withErrorLog("legal-sign", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof body.token === "string" ? body.token : ""
  if (!isLegalSignToken(token)) return json({ error: NOT_VALID }, 404)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const { data: found } = await sb
    .from("legal_sign_links")
    .select("id, legal_document_id, expires_at, revoked_at, last_opened_at, signed_at, signed_name")
    .eq("token_hash", await hashLegalSignToken(token))
    .maybeSingle()
  const link = found as LinkRow | null
  const state = link ? legalSignLinkState(link, now) : "revoked"
  if (!link || (state !== "active" && state !== "signed")) return json({ error: NOT_VALID }, 404)

  const { data: docRow } = await sb.from("legal_documents").select("*").eq("id", link.legal_document_id).maybeSingle()
  if (!docRow) return json({ error: NOT_VALID }, 404)
  const doc = docRow as DocRow

  const action = typeof body.action === "string" ? body.action : "view"

  if (action === "pdf") {
    const { data: pdf } = await sb.from("legal_sign_pdfs").select("pdf_base64").eq("link_id", link.id).maybeSingle()
    if (!pdf) return json({ error: "There is no PDF on this link." }, 404)
    const label = legalDocLabel(doc.doc_type)
    return json({
      pdf_base64: (pdf as { pdf_base64: string }).pdf_base64,
      filename: `${label.replace(/\s+/g, "-")}-${(doc.company_name || "document").slice(0, 40)}.pdf`,
    })
  }

  if (action === "sign") {
    if (state === "signed") return json({ error: "This document was already signed." }, 409)
    if (doc.status === "void" || doc.status === "signed") {
      return json({ error: "This document can no longer be signed. Ask Red Reach for a new one." }, 409)
    }
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const date = typeof body.date === "string" ? body.date : ""
    const signaturePng = typeof body.signature_png === "string" ? body.signature_png : ""
    const problem = signProblem({ name, date, agreed: body.agreed === true, signaturePng }, now)
    if (problem) return json({ error: problem }, 400)

    const { data: pdfRow } = await sb.from("legal_sign_pdfs").select("pdf_base64").eq("link_id", link.id).maybeSingle()
    if (!pdfRow) return json({ error: "There is no PDF on this link." }, 404)
    const unsigned = (pdfRow as { pdf_base64: string }).pdf_base64

    let signedPdf = unsigned
    try {
      signedPdf = await stampSignedPdf(unsigned, {
        name,
        date,
        signaturePng,
        title: doc.title || legalDocLabel(doc.doc_type),
      })
    } catch (e) {
      console.error("legal-sign stamp failed", e instanceof Error ? e.message : e)
    }

    const signedAt = now.toISOString()
    const { data: claimed } = await sb
      .from("legal_sign_links")
      .update({ signed_at: signedAt, signed_name: name })
      .eq("id", link.id)
      .is("signed_at", null)
      .select("id")
      .maybeSingle()
    if (!claimed) return json({ error: "This document was already signed." }, 409)

    const sigId = crypto.randomUUID()
    await sb.from("legal_signatures").insert({
      id: sigId,
      link_id: link.id,
      legal_document_id: doc.id,
      signed_name: name,
      signed_date: date,
      signed_at: signedAt,
      signature_png_base64: signaturePng,
      signed_pdf_base64: signedPdf,
      ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "",
      user_agent: req.headers.get("user-agent") || "",
    })

    const fileName = `Signed-NDA-${(doc.company_name || "client").replace(/[^\w.-]+/g, "_").slice(0, 40)}-${date}.pdf`
    let driveUrl = ""
    let customerDocumentId: string | null = null

    try {
      const uploader = await driveUploader(sb)
      if (uploader && doc.crm_id) {
        const { data: crm } = await sb
          .from("crm")
          .select("id, company_name, drive_folder_url")
          .eq("id", doc.crm_id)
          .maybeSingle()
        if (crm) {
          const folder = await uploader.ensureClientFolder(crm as {
            id: string
            company_name: string
            drive_folder_url?: string | null
          })
          const saved = await uploader.upload({
            folderId: folder.id,
            filename: fileName,
            contentType: "application/pdf",
            bytes: b64ToBytes(signedPdf),
          })
          driveUrl = saved.url
          const docId = crypto.randomUUID()
          await sb.from("customer_documents").insert({
            id: docId,
            company_name: doc.company_name,
            crm_id: doc.crm_id,
            category: doc.doc_type === "nda" ? "signed_nda" : "signed_contract",
            title: `Signed ${doc.title || legalDocLabel(doc.doc_type)} – ${name}`,
            file_name: fileName,
            drive_url: driveUrl,
            related_ref: doc.id.slice(0, 8),
            notes: `Signed electronically on ${date} by ${name}`,
            storage_provider: "google_drive",
            uploaded_by: "legal-sign",
            uploaded_at: signedAt,
          })
          customerDocumentId = docId
        }
      }
    } catch (e) {
      console.error("legal-sign Drive archive failed", e instanceof Error ? e.message : e)
    }

    await sb
      .from("legal_documents")
      .update({
        status: "signed",
        signed_at: signedAt,
        updated_at: signedAt,
        signed_file_name: fileName,
        drive_url: driveUrl,
        customer_document_id: customerDocumentId,
      })
      .eq("id", doc.id)

    try {
      const seeds = defaultObligationsOnSign({
        company_name: doc.company_name || "",
        crm_id: doc.crm_id || "",
        legal_document_id: doc.id,
        doc_type: doc.doc_type || "nda",
        signed_at: signedAt,
        created_by: "legal-sign",
      })
      if (seeds.length) {
        const { count } = await sb
          .from("contract_obligations")
          .select("id", { count: "exact", head: true })
          .eq("legal_document_id", doc.id)
        if (!count) {
          await sb.from("contract_obligations").insert(
            seeds.map((row) => ({
              id: crypto.randomUUID(),
              ...row,
              created_at: signedAt,
              updated_at: signedAt,
            })),
          )
        }
      }
    } catch (e) {
      // Board migration may not be applied yet — signing must still succeed.
      console.error("legal-sign obligation spawn failed", e instanceof Error ? e.message : e)
    }

    return json(
      legalSignView(doc, {
        ...link,
        signed_at: signedAt,
        signed_name: name,
        has_pdf: true,
      }, now),
    )
  }

  if (!link.last_opened_at || now.getTime() - Date.parse(link.last_opened_at) > 3_600_000) {
    await sb.from("legal_sign_links").update({ last_opened_at: now.toISOString() }).eq("id", link.id)
  }
  const { count } = await sb.from("legal_sign_pdfs").select("link_id", { count: "exact", head: true }).eq("link_id", link.id)
  return json(legalSignView(doc, { ...link, has_pdf: (count ?? 0) > 0 }, now))
}))
