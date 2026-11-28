// Public unsubscribe link for prospect outreach emails. Deploy with Verify JWT
// OFF (supabase/config.toml): the link token is the only key. Only its SHA-256
// hash is stored (outreach_messages.unsub_token_hash), as with quote accept.
//
//   GET  ?t=<token>          a small page with an Unsubscribe button (link
//                            scanners that open links do not unsubscribe anyone)
//   POST ?t=<token>          adds the address to outreach_suppressions and shows
//                            "You are unsubscribed". Also answers the one-click
//                            form POST (List-Unsubscribe=One-Click) of RFC 8058.
//
// The answer is the same whether or not the token exists, so the page says
// nothing about who was emailed. Nothing about the email is shown.
//
// Deploy: Actions > Deploy Edge Functions > outreach-unsubscribe.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { serviceRoleKey } from "../_shared/supabaseKeys.ts"
import { isUnsubscribeToken } from "../mail-inbox/outreachMail.ts"

function page(status: number, title: string, text: string, form?: string): Response {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
  const button = form
    ? `<form method="post" action="?t=${esc(form)}"><button type="submit" style="font:inherit;padding:10px 18px;border-radius:8px;border:0;background:#C8321A;color:#fff;cursor:pointer">Unsubscribe</button></form>`
    : ""
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>` +
      `<body style="font-family:system-ui,sans-serif;margin:0;padding:40px 16px;background:#F7F4F1;color:#1A1A1A">` +
      `<main style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>` +
      `<p style="line-height:1.5">${esc(text)}</p>${button}</main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      },
    },
  )
}

Deno.serve(withErrorLog("outreach-unsubscribe", async (req) => {
  const token = new URL(req.url).searchParams.get("t") || ""
  if (req.method !== "GET" && req.method !== "POST") return page(405, "Unsubscribe", "Open the link from the email.")
  if (!isUnsubscribeToken(token)) {
    return page(400, "Link not complete", "This unsubscribe link is not complete. Reply to the email with the word unsubscribe and we will remove you.")
  }
  if (req.method === "GET") {
    return page(200, "Unsubscribe", "Press the button and we will not send you outreach emails again.", token)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = serviceRoleKey() || ""
  if (!supabaseUrl || !serviceKey) {
    return page(503, "Please try again", "We could not record this just now. Reply to the email with the word unsubscribe instead.")
  }
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { error } = await sb.rpc("rr_outreach_unsubscribe", { p_token: token })
  if (error) {
    console.error("outreach-unsubscribe failed", error.message)
    return page(503, "Please try again", "We could not record this just now. Reply to the email with the word unsubscribe instead.")
  }
  return page(200, "You are unsubscribed", "We will not send you outreach emails again. Thank you for letting us know.")
}))
