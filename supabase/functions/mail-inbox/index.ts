// Mail page: each person reads their OWN Zoho mailbox inside RR Central.
// Nobody, not even an admin, can open another person's mailbox through here.
//
//   POST { action: "status" }                                  -> { ready, connected, address, canSend }
//   POST { action: "connect", return_to }                      -> { url }   (Zoho consent page)
//   GET  ?code=…&state=…&accounts-server=…                     Zoho's answer (signed state)
//   POST { action: "disconnect" }                              -> { ok }
//   POST { action: "folders" }                                 -> { folders }
//   POST { action: "list", folderId, start?, limit?, unread? }  -> { messages }
//   POST { action: "search", q, start?, limit? }               -> { messages }
//   POST { action: "message", folderId, messageId }            -> { message }
//   POST { action: "link", folderId, messageId, targetType, targetId }  -> { link }
//        (targetType: account | crm | quotation | invoice; header only, the body stays in the mailbox)
//   POST { action: "send", mode, folderId?, messageId?, to, cc?, bcc?, subject, text,
//          attachments?: [{ name, base64 }], linkTo?: { targetType, targetId } }  -> { ok, messageId, linked }
//        (mode: new | reply | replyAll | forward; only from the Send button, from the person's own address;
//         attachments: PDFs only, at most 3 and 10 MB; linkTo files the sent email in that record's email history)
//   POST { action: "outreach_send", id }                      -> { ok, messageId, recorded }
//        (prospect outreach: an email this person approved, checked by rr_outreach_claim_send)
//
// Nothing is moved, deleted or marked as read in the mailbox here. Email is
// sent only by "send" and "outreach_send", which the page calls only when the person presses Send.
// Each person's Zoho refresh token is stored encrypted in mail_accounts
// (service role only, no policies) and the access token never leaves this
// function. The browser only ever gets mail content.
// Who: admin, manager and sales (rr_is_staff). The Zoho mailbox must be the
// person's own: one of its addresses must be their RR Central login.
//
// Secrets: ZOHO_MAIL_CLIENT_ID, ZOHO_MAIL_CLIENT_SECRET (a Zoho "Server-based
// Application" whose redirect URI is this function's URL), MAIL_TOKEN_KEY
// (32+ random characters, encrypts the stored tokens), optional
// ZOHO_ACCOUNTS_DOMAIN (default https://accounts.zoho.com).
// Deploy: Actions > Deploy Edge Functions > mail-inbox (verify_jwt = false in supabase/config.toml).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { readState, signState } from "../_shared/googleDrive.ts"
import {
  canSendWith,
  cleanAttachments,
  clampLimit,
  cleanSubject,
  composeHtml,
  clampStart,
  cleanSearch,
  isZohoId,
  linkTargetTable,
  mailboxBelongsTo,
  normalizeFolders,
  normalizeMessage,
  parseRecipients,
  plain,
  MAX_RECIPIENTS,
  sendMode,
  stripActiveContent,
  underSendLimit,
  uploadedAttachment,
  zohoAccountsOrigin,
  zohoConsentUrl,
  zohoMailOrigin,
  ZOHO_MAIL_SCOPES,
} from "./mailbox.ts"
import { openToken, sealToken, tokenKeyProblem } from "./tokenBox.ts"
import { isOutreachId, type OutreachClaim, outreachClaimProblem, outreachPayload, unsubscribeUrl } from "./outreachMail.ts"
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  }
}

function safeReturnTo(raw: unknown): string | null {
  try {
    const url = new URL(String(raw || ""))
    return allowedOrigins().includes(url.origin) ? url.toString() : null
  } catch {
    return null
  }
}

function backTo(returnTo: string, params: Record<string, string>): Response {
  const url = new URL(returnTo)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store" } })
}

function page(status: number, text: string): Response {
  const safe = text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Mail</title><p style="font-family:system-ui;margin:40px">${safe}</p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class MailError extends Error {
  constructor(public status: number, message: string, public setup = false) {
    super(message)
  }
}

type App = { clientId: string; clientSecret: string; tokenKey: string; accountsOrigin: string }

function zohoApp(): App | null {
  const clientId = Deno.env.get("ZOHO_MAIL_CLIENT_ID") || ""
  const clientSecret = Deno.env.get("ZOHO_MAIL_CLIENT_SECRET") || ""
  const tokenKey = Deno.env.get("MAIL_TOKEN_KEY") || ""
  if (!clientId || !clientSecret || tokenKeyProblem(tokenKey)) return null
  const accountsOrigin = zohoAccountsOrigin(Deno.env.get("ZOHO_ACCOUNTS_DOMAIN") || "https://accounts.zoho.com") ||
    "https://accounts.zoho.com"
  return { clientId, clientSecret, tokenKey, accountsOrigin }
}

const NOT_SET_UP = "Mail is not set up yet. An admin adds ZOHO_MAIL_CLIENT_ID, ZOHO_MAIL_CLIENT_SECRET and MAIL_TOKEN_KEY in Supabase (docs/mail.md)."

type Row = {
  user_email: string
  account_email: string
  zoho_account_id: string
  accounts_domain: string
  mail_domain: string
  refresh_token_enc: string
  scopes: string
}

type Box = { mail: string; accountId: string; token: string; address: string; canSend: boolean }

// Access tokens per person, kept in this instance's memory only, never sent to the browser.
const tokens = new Map<string, { token: string; expiresAt: number; stamp: string }>()

async function zohoToken(accountsOrigin: string, body: Record<string, string>) {
  const res = await fetch(`${accountsOrigin}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  })
  return (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }
}

async function revoke(accountsOrigin: string, refreshToken: string) {
  await fetch(`${accountsOrigin}/oauth/v2/token/revoke?${new URLSearchParams({ token: refreshToken })}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {})
}

async function loadRow(sb: SupabaseClient, email: string): Promise<Row | null> {
  const { data, error } = await sb
    .from("mail_accounts")
    .select("user_email, account_email, zoho_account_id, accounts_domain, mail_domain, refresh_token_enc, scopes")
    .eq("user_email", email)
    .maybeSingle()
  if (error) {
    if (/mail_accounts/.test(error.message || "") && /exist|schema cache/i.test(error.message || "")) {
      throw new MailError(409, "Mail is not set up yet. An admin runs the mail_accounts SQL from the SQL copy page.", true)
    }
    throw new Error("Could not read your mailbox connection")
  }
  return (data as Row | null) || null
}

async function myBox(sb: SupabaseClient, app: App, email: string): Promise<Box> {
  const row = await loadRow(sb, email)
  if (!row) throw new MailError(409, "Connect your Zoho mailbox first.", true)
  const accountsOrigin = zohoAccountsOrigin(row.accounts_domain)
  const mailOrigin = accountsOrigin ? zohoMailOrigin(accountsOrigin) : null
  if (!accountsOrigin || !mailOrigin || !isZohoId(row.zoho_account_id)) {
    throw new MailError(409, "Your mailbox connection is incomplete. Disconnect and connect it again.", true)
  }
  const box = { mail: mailOrigin, accountId: row.zoho_account_id, address: row.account_email, canSend: canSendWith(row.scopes) }
  const hit = tokens.get(email)
  if (hit && hit.stamp === row.refresh_token_enc && hit.expiresAt > Date.now() + 60_000) return { ...box, token: hit.token }

  const refreshToken = await openToken(app.tokenKey, row.refresh_token_enc)
  if (!refreshToken) throw new MailError(409, "Your saved mailbox key cannot be opened (the key changed). Connect your mailbox again.", true)
  const tok = await zohoToken(accountsOrigin, {
    grant_type: "refresh_token",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: refreshToken,
  })
  if (!tok.access_token) {
    throw new MailError(409, `Zoho did not accept your saved key${tok.error ? ` (${tok.error})` : ""}. Connect your mailbox again.`, true)
  }
  tokens.set(email, {
    token: tok.access_token,
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
    stamp: row.refresh_token_enc,
  })
  return { ...box, token: tok.access_token }
}

async function zohoGet(email: string, box: Box, path: string, params?: Record<string, string>): Promise<unknown> {
  const qs = params ? `?${new URLSearchParams(params)}` : ""
  const res = await fetch(`${box.mail}/api/accounts/${encodeURIComponent(box.accountId)}${path}${qs}`, {
    headers: { Authorization: `Zoho-oauthtoken ${box.token}` },
    signal: AbortSignal.timeout(25_000),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; status?: { description?: string } }
  if (res.status === 401) {
    tokens.delete(email)
    throw new MailError(409, "Zoho refused your mailbox key. Connect your mailbox again.", true)
  }
  if (!res.ok) throw new MailError(502, body.status?.description || `Zoho Mail answered ${res.status}`)
  return body.data
}

async function zohoPost(email: string, box: Box, path: string, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${box.mail}/api/accounts/${encodeURIComponent(box.accountId)}${path}`, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${box.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; status?: { description?: string }; data_error?: unknown }
  if (res.status === 401) {
    tokens.delete(email)
    throw new MailError(409, "Zoho refused your mailbox key. Connect your mailbox again.", true)
  }
  if (!res.ok) throw new MailError(502, `Zoho did not send the email: ${body.status?.description || `answered ${res.status}`}`)
  return body.data
}

/** Puts one file in the person's Zoho upload area; the send call then refers to it. */
async function zohoUpload(email: string, box: Box, name: string, bytes: Uint8Array) {
  const res = await fetch(
    `${box.mail}/api/accounts/${encodeURIComponent(box.accountId)}/messages/attachments?${new URLSearchParams({ fileName: name })}`,
    {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${box.token}`, "Content-Type": "application/octet-stream" },
      body: new Blob([bytes as BlobPart]),
      signal: AbortSignal.timeout(60_000),
    },
  )
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; status?: { description?: string } }
  if (res.status === 401) {
    tokens.delete(email)
    throw new MailError(409, "Zoho refused your mailbox key. Connect your mailbox again.", true)
  }
  const file = res.ok ? uploadedAttachment(body.data) : null
  if (!file) throw new MailError(502, `Zoho did not take the attachment: ${body.status?.description || `answered ${res.status}`}`)
  return file
}

// When each person last sent, in this instance's memory, so a mistake cannot become a flood.
const sends = new Map<string, number[]>()

const rows = (data: unknown) => (Array.isArray(data) ? (data as Record<string, unknown>[]) : [])

/** Zoho's answer after the person agrees. Checks the signed state, then that the mailbox is theirs. */
async function callback(req: Request, sb: SupabaseClient, app: App | null, redirectUri: string): Promise<Response> {
  const params = new URL(req.url).searchParams
  if (!app) return page(503, NOT_SET_UP)
  const state = await readState(app.clientSecret, params.get("state") || "")
  if (!state) return page(400, "This link has expired. Go back to Mail in RR Central and connect again.")
  const returnTo = safeReturnTo(state.returnTo)
  if (!returnTo) return page(400, "This link is not for RR Central.")
  const email = state.email.toLowerCase()
  const { data: member } = await sb
    .from("app_users")
    .select("role, active")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle()
  if (!member?.active || !["admin", "manager", "sales"].includes(String(member.role))) {
    return backTo(returnTo, { mail: "error", reason: "Your role cannot use Mail" })
  }
  const code = params.get("code") || ""
  if (!code) {
    return backTo(returnTo, { mail: "error", reason: params.get("error") === "access_denied" ? "Zoho access was not given" : "Zoho gave no answer" })
  }
  // Zoho says which region the person's account lives in; only Zoho's own servers are accepted.
  const accountsOrigin = zohoAccountsOrigin(params.get("accounts-server") || app.accountsOrigin)
  if (!accountsOrigin) return backTo(returnTo, { mail: "error", reason: "Zoho answered from an unknown server" })

  const tok = await zohoToken(accountsOrigin, {
    grant_type: "authorization_code",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    redirect_uri: redirectUri,
    code,
  })
  if (!tok.access_token || !tok.refresh_token) {
    return backTo(returnTo, { mail: "error", reason: `Zoho gave no lasting access${tok.error ? ` (${tok.error})` : ""}. Try again.` })
  }
  const mailOrigin = zohoMailOrigin(accountsOrigin)
  const accRes = await fetch(`${mailOrigin}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}` },
    signal: AbortSignal.timeout(20_000),
  })
  const accBody = (await accRes.json().catch(() => ({}))) as { data?: Record<string, unknown>[] }
  const account = (accBody.data || []).find((a) => mailboxBelongsTo(email, a))
  if (!accRes.ok || !account || !isZohoId(String(account.accountId ?? ""))) {
    await revoke(accountsOrigin, tok.refresh_token)
    return backTo(returnTo, {
      mail: "error",
      reason: `That Zoho mailbox is not ${email}. Sign in to Zoho as ${email} and connect again.`,
    })
  }

  const old = await loadRow(sb, email).catch(() => null)
  const { error } = await sb.from("mail_accounts").upsert(
    {
      user_email: email,
      provider: "zoho",
      account_email: String(account.primaryEmailAddress || account.mailboxAddress || email).toLowerCase(),
      zoho_account_id: String(account.accountId),
      accounts_domain: accountsOrigin,
      mail_domain: mailOrigin,
      refresh_token_enc: await sealToken(app.tokenKey, tok.refresh_token),
      scopes: ZOHO_MAIL_SCOPES,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" },
  )
  if (error) {
    await revoke(accountsOrigin, tok.refresh_token)
    return backTo(returnTo, { mail: "error", reason: "Could not save your mailbox connection. Has the mail_accounts SQL been run?" })
  }
  // The earlier key for this person is no longer needed.
  if (old) {
    const previous = await openToken(app.tokenKey, old.refresh_token_enc)
    const oldOrigin = zohoAccountsOrigin(old.accounts_domain)
    if (previous && oldOrigin && previous !== tok.refresh_token) await revoke(oldOrigin, previous)
  }
  tokens.delete(email)
  return backTo(returnTo, { mail: "connected" })
}

Deno.serve(withErrorLog("mail-inbox", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = publicApiKey() || ""
  const serviceKey = serviceRoleKey() || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)
  const app = zohoApp()
  const redirectUri = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/mail-inbox`
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  if (req.method === "GET") return callback(req, sb, app, redirectUri)
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const origin = req.headers.get("Origin")
  if (origin && !allowedOrigins().includes(origin)) return json({ error: "Origin not allowed" }, 403)

  // Verify JWT is off for this function, so check the signed in user here, before anything else.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  // Admin, manager and sales only: staff (assigned accounts) and viewers do not use Mail.
  const { data: isStaff } = await userDb.rpc("rr_is_staff")
  if (isStaff !== true) return json({ error: "Your role cannot use Mail" }, 403)
  const email = String(who.user.email || "").toLowerCase()
  if (!email) return json({ error: "Your login has no email address" }, 403)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || "status")

  try {
    if (action === "status") {
      if (!app) return json({ ready: false, connected: false, address: "", canSend: false })
      const row = await loadRow(sb, email)
      return json({ ready: true, connected: Boolean(row), address: row?.account_email || "", canSend: Boolean(row && canSendWith(row.scopes)) })
    }
    if (!app) return json({ error: NOT_SET_UP, setup: true }, 409)

    if (action === "connect") {
      const returnTo = safeReturnTo(body.return_to)
      if (!returnTo) return json({ error: "Open Mail from RR Central to connect" }, 400)
      const state = await signState(app.clientSecret, { email, returnTo, exp: Date.now() + 15 * 60_000 })
      return json({ url: zohoConsentUrl({ accountsOrigin: app.accountsOrigin, clientId: app.clientId, redirectUri, state, loginHint: email }) })
    }

    if (action === "disconnect") {
      const row = await loadRow(sb, email)
      if (row) {
        const refreshToken = await openToken(app.tokenKey, row.refresh_token_enc)
        const accountsOrigin = zohoAccountsOrigin(row.accounts_domain)
        if (refreshToken && accountsOrigin) await revoke(accountsOrigin, refreshToken)
        await sb.from("mail_accounts").delete().eq("user_email", email)
      }
      tokens.delete(email)
      return json({ ok: true })
    }

    if (action === "folders") {
      const box = await myBox(sb, app, email)
      return json({ folders: normalizeFolders(rows(await zohoGet(email, box, "/folders"))) })
    }

    if (action === "list") {
      if (!isZohoId(body.folderId)) return json({ error: "Pick a folder" }, 400)
      const box = await myBox(sb, app, email)
      const data = await zohoGet(email, box, "/messages/view", {
        folderId: body.folderId,
        start: String(clampStart(body.start)),
        limit: String(clampLimit(body.limit)),
        status: body.unread === true ? "unread" : "all",
        includeto: "true",
        sortBy: "date",
        sortorder: "false",
      })
      return json({ messages: rows(data).map(normalizeMessage).filter(Boolean) })
    }

    if (action === "search") {
      const q = cleanSearch(body.q)
      if (q.length < 2) return json({ error: "Type at least 2 characters to search" }, 400)
      const box = await myBox(sb, app, email)
      const data = await zohoGet(email, box, "/messages/search", {
        searchKey: `entire:${q}`,
        start: String(clampStart(body.start)),
        limit: String(clampLimit(body.limit)),
        includeto: "true",
      })
      return json({ messages: rows(data).map(normalizeMessage).filter(Boolean) })
    }

    if (action === "message") {
      if (!isZohoId(body.folderId) || !isZohoId(body.messageId)) return json({ error: "Pick an email" }, 400)
      const box = await myBox(sb, app, email)
      const base = `/folders/${body.folderId}/messages/${body.messageId}`
      const [details, content] = await Promise.all([zohoGet(email, box, `${base}/details`), zohoGet(email, box, `${base}/content`)])
      const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>
      const head = normalizeMessage({ ...d, messageId: body.messageId, folderId: body.folderId })
      const html = String(((content && typeof content === "object" ? content : {}) as { content?: unknown }).content || "")
      return json({ message: { ...head, ccAddress: plain(d.ccAddress, 1000), html: stripActiveContent(html) } })
    }

    if (action === "link") {
      if (!isZohoId(body.folderId) || !isZohoId(body.messageId)) return json({ error: "Pick an email" }, 400)
      const table = linkTargetTable(body.targetType)
      const targetId = String(body.targetId || "")
      if (!table || !UUID.test(targetId)) return json({ error: "Pick what to link the email to" }, 400)
      const { data: target, error: targetError } = await sb.from(table).select("id").eq("id", targetId).maybeSingle()
      if (targetError || !target) return json({ error: "That record was not found" }, 404)
      // The header comes from the person's own mailbox, so only an email they have can be linked.
      const box = await myBox(sb, app, email)
      const details = await zohoGet(email, box, `/folders/${body.folderId}/messages/${body.messageId}/details`)
      const head = normalizeMessage({ ...((details && typeof details === "object" ? details : {}) as Record<string, unknown>), messageId: body.messageId, folderId: body.folderId })
      if (!head) return json({ error: "That email was not found in your mailbox" }, 404)
      const row = {
        target_type: String(body.targetType),
        target_id: targetId,
        mailbox_owner: email,
        message_id: head.messageId,
        folder_id: head.folderId,
        subject: head.subject.slice(0, 300),
        from_address: head.fromAddress.slice(0, 300),
        to_address: head.toAddress.slice(0, 1000),
        sent_at: head.receivedTime ? new Date(head.receivedTime).toISOString() : null,
        has_attachment: head.hasAttachment,
        linked_by: email,
      }
      const { data: saved, error } = await sb
        .from("mail_links")
        .upsert(row, { onConflict: "mailbox_owner,message_id,target_type,target_id", ignoreDuplicates: false })
        .select("id, target_type, target_id")
        .single()
      if (error) {
        if (/mail_links/.test(error.message || "")) {
          return json({ error: "Linking emails is not set up yet. An admin runs the mail_links SQL.", setup: true }, 409)
        }
        throw new Error(error.message)
      }
      return json({ link: saved })
    }

    if (action === "send") {
      const mode = sendMode(body.mode)
      if (!mode) return json({ error: "Unknown kind of email" }, 400)
      const to = parseRecipients(body.to)
      const cc = parseRecipients(body.cc)
      const bcc = parseRecipients(body.bcc)
      const bad = [...to.bad, ...cc.bad, ...bcc.bad]
      if (bad.length) return json({ error: `Not an email address: ${bad.slice(0, 3).join(", ")}` }, 400)
      if (!to.list.length) return json({ error: "Add at least one address in To" }, 400)
      if (to.list.length + cc.list.length + bcc.list.length > MAX_RECIPIENTS) {
        return json({ error: `At most ${MAX_RECIPIENTS} recipients per email` }, 400)
      }
      const subject = cleanSubject(body.subject)
      const text = String(body.text ?? "")
      if (text.length > 100_000) return json({ error: "The message is too long" }, 400)
      if (!subject && !text.trim()) return json({ error: "Write a subject or a message first" }, 400)
      if (mode !== "new" && (!isZohoId(body.folderId) || !isZohoId(body.messageId))) return json({ error: "Pick the email to answer" }, 400)
      const files = cleanAttachments(body.attachments)
      if ("error" in files) return json({ error: files.error }, 400)
      // Optional: file the sent email under a client, CRM entry, quotation or invoice.
      const link = body.linkTo && typeof body.linkTo === "object" ? (body.linkTo as { targetType?: unknown; targetId?: unknown }) : null
      const linkTable = link ? linkTargetTable(link.targetType) : null
      const linkId = String(link?.targetId ?? "")
      if (link && (!linkTable || !UUID.test(linkId))) return json({ error: "Pick what to file the email under" }, 400)

      const box = await myBox(sb, app, email)
      if (!box.canSend) {
        return json({ error: "Sending needs one more permission from Zoho. Press Allow sending and sign in to Zoho again.", setup: true, needsSendScope: true }, 409)
      }
      const now = Date.now()
      const history = (sends.get(email) || []).filter((t) => now - t < 10 * 60_000)
      if (!underSendLimit(history, now)) return json({ error: "You have sent 20 emails in 10 minutes. Wait a few minutes and try again." }, 429)

      // A reply or forward quotes the original, read here from the person's own mailbox.
      let quoted = null
      if (mode !== "new") {
        const base = `/folders/${body.folderId}/messages/${body.messageId}`
        const [details, content] = await Promise.all([zohoGet(email, box, `${base}/details`), zohoGet(email, box, `${base}/content`)])
        const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>
        const head = normalizeMessage({ ...d, messageId: body.messageId, folderId: body.folderId })
        if (!head) return json({ error: "That email was not found in your mailbox" }, 404)
        quoted = {
          from: head.fromAddress,
          to: head.toAddress,
          cc: plain(d.ccAddress, 1000),
          date: head.receivedTime ? new Date(head.receivedTime).toUTCString() : "",
          subject: head.subject,
          html: stripActiveContent(String(((content && typeof content === "object" ? content : {}) as { content?: unknown }).content || "")),
        }
      }
      const payload: Record<string, unknown> = {
        // Always the person's own mailbox address; the page cannot choose another sender.
        fromAddress: box.address,
        toAddress: to.list.join(","),
        subject,
        content: composeHtml(text, mode, quoted),
        mailFormat: "html",
      }
      if (cc.list.length) payload.ccAddress = cc.list.join(",")
      if (bcc.list.length) payload.bccAddress = bcc.list.join(",")
      if (files.list.length) {
        payload.attachments = []
        for (const f of files.list) (payload.attachments as unknown[]).push(await zohoUpload(email, box, f.name, f.bytes))
      }
      const isReply = mode === "reply" || mode === "replyAll"
      const sent = await zohoPost(
        email,
        box,
        isReply ? `/messages/${body.messageId}` : "/messages",
        isReply ? { ...payload, action: "reply" } : payload,
      )
      history.push(now)
      sends.set(email, history)
      const id = String(((sent && typeof sent === "object" ? sent : {}) as { messageId?: unknown }).messageId ?? "")
      const messageId = isZohoId(id) ? id : ""
      let linked = false
      if (link && linkTable && messageId) {
        // The email is already sent: a filing problem is reported as linked: false, never as a failed send.
        try {
          const { data: target } = await sb.from(linkTable).select("id").eq("id", linkId).maybeSingle()
          let sentFolder = ""
          try {
            sentFolder = normalizeFolders(rows(await zohoGet(email, box, "/folders"))).find((f) => f.kind === "sent")?.folderId || ""
          } catch { /* the history row still shows without a folder */ }
          if (target) {
            const { error } = await sb.from("mail_links").upsert(
              {
                target_type: String(link.targetType),
                target_id: linkId,
                mailbox_owner: email,
                message_id: messageId,
                folder_id: sentFolder,
                subject: subject.slice(0, 300),
                from_address: box.address.slice(0, 300),
                to_address: to.list.join(", ").slice(0, 1000),
                sent_at: new Date(now).toISOString(),
                has_attachment: files.list.length > 0,
                linked_by: email,
              },
              { onConflict: "mailbox_owner,message_id,target_type,target_id", ignoreDuplicates: true },
            )
            linked = !error
            if (error) console.error("mail-inbox link after send failed", error.message)
          }
        } catch (e) {
          console.error("mail-inbox link after send failed", e instanceof Error ? e.message : e)
        }
      }
      return json({ ok: true, messageId, linked })
    }

    if (action === "outreach_send") {
      // Prospect outreach (migration 20261338090000): one approved email, sent
      // only because this person pressed Send. The database checks, with this
      // person's own sign in token, that they approved this exact text, that it
      // is under the daily cap and not suppressed; then it is sent from their
      // own mailbox and the result is recorded. The email text is never logged.
      if (!isOutreachId(body.id)) return json({ error: "Pick the outreach email to send" }, 400)
      const { data: isManager } = await userDb.rpc("rr_is_manager_or_admin")
      if (isManager !== true) return json({ error: "Only an admin or manager can send outreach email" }, 403)
      const box = await myBox(sb, app, email)
      if (!box.canSend) {
        return json({ error: "Sending needs one more permission from Zoho. Open Mail and press Allow sending.", setup: true, needsSendScope: true }, 409)
      }
      const now = Date.now()
      const history = (sends.get(email) || []).filter((t) => now - t < 10 * 60_000)
      if (!underSendLimit(history, now)) return json({ error: "You have sent 20 emails in 10 minutes. Wait a few minutes and try again." }, 429)

      const { data: claimed, error: claimError } = await userDb.rpc("rr_outreach_claim_send", { p_id: body.id })
      if (claimError) return json({ error: claimError.message || "This email cannot be sent" }, 409)
      const claim = claimed as OutreachClaim
      const finish = (ok: boolean, zohoId: string, problem: string) =>
        sb.rpc("rr_outreach_finish_send", { p_id: body.id, p_ok: ok, p_zoho_message_id: zohoId, p_error: problem })
      const problem = outreachClaimProblem(claim, box.address)
      if (problem) {
        await finish(false, "", problem)
        return json({ error: problem }, 409)
      }
      const link = unsubscribeUrl(supabaseUrl, claim.unsubscribe_token)
      let sent: unknown
      try {
        sent = await zohoPost(email, box, "/messages", outreachPayload(claim, box.address, link))
      } catch (e) {
        const why = e instanceof MailError ? e.message : "Zoho Mail could not be reached"
        await finish(false, "", why)
        throw e
      }
      history.push(now)
      sends.set(email, history)
      const id = String(((sent && typeof sent === "object" ? sent : {}) as { messageId?: unknown }).messageId ?? "")
      const messageId = isZohoId(id) ? id : ""
      const { error: finishError } = await finish(true, messageId, "")
      // The email has gone: a recording problem is reported, never as a failed send.
      if (finishError) console.error("mail-inbox outreach finish failed", finishError.message)
      return json({ ok: true, messageId, recorded: !finishError })
    }

    return json({ error: "Unknown action" }, 400)
  } catch (e) {
    if (e instanceof MailError) return json({ error: e.message, setup: e.setup || undefined }, e.status)
    console.error("mail-inbox failed", e instanceof Error ? e.message : e)
    return json({ error: "Zoho Mail could not be reached. Please try again." }, 502)
  }
}, { secrets: ["ZOHO_MAIL_CLIENT_ID", "ZOHO_MAIL_CLIENT_SECRET", "MAIL_TOKEN_KEY"] }))
