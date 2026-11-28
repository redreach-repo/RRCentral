// Prospect outreach: the email that goes out when a person presses Send on an
// approved outreach email (action "outreach_send" in index.ts). Pure helpers,
// no network: tested in supabase/tests/functions/outreach_mail_test.ts.
//
// The approved subject and body are sent exactly as approved. Below the body
// come the sender's signature and the compliance footer: the company's legal
// name and postal address (from Outreach settings, never made up here) and
// an opt-out line with a one-click unsubscribe link.

import { cleanSubject, textToHtml } from "./mailbox.ts"

export type OutreachClaim = {
  id: string
  to_email: string
  to_name: string
  subject: string
  body: string
  sender_email: string
  sender_name: string
  signature: string
  legal_name: string
  address: string
  opt_out_text: string
  unsubscribe_token: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^[0-9a-f]{64}$/

export function isOutreachId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v)
}

export function isUnsubscribeToken(v: unknown): v is string {
  return typeof v === "string" && TOKEN.test(v)
}

/** The public unsubscribe link for one email. */
export function unsubscribeUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/outreach-unsubscribe?t=${encodeURIComponent(token)}`
}

/** Why the claimed email cannot be sent as it is, or "" when it can. */
export function outreachClaimProblem(c: Partial<OutreachClaim> | null | undefined, mailboxAddress: string): string {
  if (!c || !isOutreachId(c.id)) return "The email could not be prepared"
  if (!c.to_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.to_email)) return "The email has no valid recipient"
  if (!cleanSubject(c.subject) || !String(c.body || "").trim()) return "Subject and body are both needed"
  if (String(c.sender_email || "").toLowerCase() !== mailboxAddress.trim().toLowerCase()) {
    return `This email goes from ${c.sender_email || "another sender"}, but your connected mailbox is ${mailboxAddress}`
  }
  if (!String(c.signature || "").trim()) return "Your sender signature is empty"
  if (!String(c.legal_name || "").trim() || !String(c.address || "").trim()) {
    return "Add the company legal name and postal address in Outreach settings"
  }
  if (!String(c.opt_out_text || "").trim()) return "The opt-out line is empty"
  if (!isUnsubscribeToken(c.unsubscribe_token)) return "The unsubscribe link could not be made"
  return ""
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/** Plain text of the footer, also what the review screen previews. */
export function outreachFooterText(c: Pick<OutreachClaim, "legal_name" | "address" | "opt_out_text">, link: string): string {
  return [`${c.legal_name.trim()}, ${c.address.trim().replace(/\s*\n\s*/g, ", ")}`, `${c.opt_out_text.trim()} ${link}`].join("\n")
}

/**
 * The HTML sent to Zoho: approved body, signature, then the footer. Every
 * piece is the person's plain text, escaped; only the unsubscribe link is a link.
 */
export function composeOutreachHtml(c: OutreachClaim, link: string): string {
  const body = `<div style="font-family:Arial,sans-serif;font-size:14px">${textToHtml(c.body)}</div>`
  const signature = `<div style="font-family:Arial,sans-serif;font-size:14px;margin-top:16px">${textToHtml(c.signature)}</div>`
  const company = textToHtml(`${c.legal_name.trim()}, ${c.address.trim().replace(/\s*\n\s*/g, ", ")}`)
  const optOut = `${textToHtml(c.opt_out_text.trim()).replace(/<\/div>$/, "")} <a href="${escapeAttr(link)}">Unsubscribe</a></div>`
  const footer = `<div style="font-family:Arial,sans-serif;font-size:11px;color:#666;margin-top:24px;border-top:1px solid #ddd;padding-top:8px">${company}${optOut}</div>`
  return `${body}${signature}${footer}`
}

/**
 * Zoho Mail's send API (POST /api/accounts/{id}/messages) takes from, to, cc,
 * bcc, subject, content, mailFormat, askReceipt, encoding and attachments, and
 * has no field for custom headers, so a List-Unsubscribe header cannot be
 * added from here. The unsubscribe link in the footer is the opt-out instead.
 */
export const ZOHO_SUPPORTS_LIST_UNSUBSCRIBE = false

export function outreachPayload(c: OutreachClaim, fromAddress: string, link: string): Record<string, unknown> {
  return {
    fromAddress,
    toAddress: c.to_email,
    subject: cleanSubject(c.subject),
    content: composeOutreachHtml(c, link),
    mailFormat: "html",
  }
}
