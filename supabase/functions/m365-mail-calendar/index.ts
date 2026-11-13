// Microsoft 365 Phase A+B for RR Central (Mail.Send + Mail.Read + Calendars.ReadWrite).
// Verify JWT is off — Microsoft's OAuth callback is a plain GET; other calls check auth in code.
//
//   POST { action: "status" | "connect" | "disconnect" | "sendMail" | "listInbox" | "listSent" |
//                  "syncFollowUp" | "deleteEvent" | "createTeamMeeting" | "listEvents" | "listCalendars" }
//   GET  ?code=…&state=…   Microsoft callback
//
// Secrets: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, optional MICROSOFT_TENANT_ID.
// See docs/COMPLIANCE_NOTES.md § M365.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { readState, signState } from "../_shared/googleDrive.ts"
import {
  deleteM365Event,
  exchangeM365Code,
  listM365Events,
  listM365FolderMessages,
  loadM365Connection,
  m365AccessToken,
  m365AccountEmail,
  m365App,
  m365ConsentUrl,
  sendM365Mail,
  upsertM365Event,
} from "../_shared/m365MailCalendar.ts"

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
    Vary: "Origin",
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
    `<!doctype html><meta charset="utf-8"><title>Microsoft 365</title><p style="font-family:system-ui;margin:40px">${safe}</p>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  )
}

const STATE_MINUTES = 15

Deno.serve(withErrorLog("m365-mail-calendar", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)
  const app = m365App()
  const redirectUri = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/m365-mail-calendar`
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  if (req.method === "GET") {
    const params = new URL(req.url).searchParams
    if (!app) {
      return page(503, "Microsoft 365 is not set up yet. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in Supabase.")
    }
    const state = await readState(app.clientSecret, params.get("state") || "")
    if (!state) {
      return page(400, "This link has expired. Go back to RR Central Settings and connect Microsoft 365 again.")
    }
    const returnTo = safeReturnTo(state.returnTo)
    if (!returnTo) return page(400, "This link is not for RR Central.")
    const { data: admin } = await sb
      .from("app_users")
      .select("role, active")
      .ilike("email", state.email.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle()
    if (!admin?.active || admin.role !== "admin") {
      return backTo(returnTo, { m365: "error", reason: "Only an admin can connect Microsoft 365" })
    }
    const code = params.get("code") || ""
    if (!code) {
      return backTo(returnTo, {
        m365: "error",
        reason: params.get("error") === "access_denied" ? "Microsoft access was not given" : "Microsoft gave no answer",
      })
    }
    try {
      const tokens = await exchangeM365Code(app, code, redirectUri)
      const old = await loadM365Connection(sb)
      const refreshToken = tokens.refreshToken || old?.refresh_token || ""
      if (!refreshToken) {
        throw new Error(
          "Microsoft gave no lasting access. Remove RR Central under account permissions and connect again.",
        )
      }
      const token = tokens.accessToken || (await m365AccessToken(app, refreshToken))
      const email = await m365AccountEmail(token)
      const { error } = await sb.from("m365_connection").upsert({
        id: 1,
        refresh_token: refreshToken,
        account_email: email,
        connected_by: state.email,
        connected_at: new Date().toISOString(),
      })
      if (error) throw new Error(`Could not save the connection: ${error.message}`)
      await sb.from("app_settings").upsert(
        [
          { key: "m365Connected", value: "yes" },
          { key: "m365AccountEmail", value: email },
          { key: "m365MailEnabled", value: "yes" },
          { key: "m365CalendarEnabled", value: "yes" },
        ],
        { onConflict: "key" },
      )
      return backTo(returnTo, { m365: "connected" })
    } catch (e) {
      console.error("m365-mail-calendar connect failed", e)
      return backTo(returnTo, { m365: "error", reason: String((e as Error).message || e).slice(0, 200) })
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const origin = req.headers.get("Origin")
  if (origin && !allowedOrigins().includes(origin)) return json({ error: "Origin not allowed" }, 403)

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  const { data: isMember } = await userDb.rpc("rr_is_member")
  if (isMember !== true) return json({ error: "Your account does not have access to RR Central" }, 403)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || "status")

  if (action === "status") {
    const conn = await loadM365Connection(sb)
    return json({
      configured: Boolean(app),
      connected: Boolean(app && conn),
      account_email: conn?.account_email || "",
      redirect_uri: redirectUri,
      scopes: "Mail.Send + Mail.Read + Calendars.ReadWrite (Phase A+B)",
    })
  }

  if (action === "connect" || action === "disconnect") {
    const { data: isAdmin } = await userDb.rpc("rr_is_admin")
    if (isAdmin !== true) return json({ error: "Only an admin can connect or disconnect Microsoft 365" }, 403)
    if (action === "disconnect") {
      await sb.from("m365_connection").delete().eq("id", 1)
      await sb.from("app_settings").upsert(
        [
          { key: "m365Connected", value: "no" },
          { key: "m365AccountEmail", value: "" },
          { key: "m365MailEnabled", value: "no" },
          { key: "m365CalendarEnabled", value: "no" },
        ],
        { onConflict: "key" },
      )
      return json({ ok: true })
    }
    if (!app) return json({ error: "Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in Supabase first" }, 503)
    const returnTo = safeReturnTo(body.return_to)
    if (!returnTo) return json({ error: "Open RR Central from its usual address and try again" }, 400)
    const state = await signState(app.clientSecret, {
      email: String(who.user.email || "").toLowerCase(),
      returnTo,
      exp: Date.now() + STATE_MINUTES * 60_000,
    })
    return json({ url: m365ConsentUrl(app, redirectUri, state) })
  }

  async function requireToken(): Promise<string> {
    if (!app) throw new Error("Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in Supabase first")
    const conn = await loadM365Connection(sb)
    if (!conn) throw new Error("Connect Microsoft 365 in Settings first")
    return m365AccessToken(app, conn.refresh_token)
  }

  try {
    if (action === "sendMail") {
      const token = await requireToken()
      await sendM365Mail(token, {
        to: String(body.to || ""),
        subject: String(body.subject || ""),
        body: String(body.body || ""),
        fromAddress: body.fromAddress ? String(body.fromAddress) : undefined,
      })
      return json({ ok: true })
    }

    if (action === "listInbox" || action === "listSent") {
      const token = await requireToken()
      const limit = typeof body.limit === "number" ? body.limit : Number(body.limit) || 25
      const statusRaw = String(body.status || "all")
      const status = statusRaw === "read" || statusRaw === "unread" ? statusRaw : "all"
      const messages = await listM365FolderMessages(token, {
        folder: action === "listSent" ? "sentitems" : "inbox",
        limit,
        status: action === "listSent" ? "all" : status,
      })
      return json({ messages })
    }

    if (action === "syncFollowUp") {
      const token = await requireToken()
      const company = String(body.company || "").trim()
      const followUpDate = String(body.followUpDate || "").slice(0, 10)
      if (!company) return json({ error: "company is required" }, 400)
      if (!followUpDate) return json({ error: "followUpDate is required" }, 400)
      const description = [
        body.nextAction ? `Action: ${body.nextAction}` : "",
        body.owner ? `Owner: ${body.owner}` : "",
        body.contactName ? `Contact: ${body.contactName}` : "",
        body.contactEmail ? `Email: ${body.contactEmail}` : "",
      ]
        .filter(Boolean)
        .join("\n")
      const attendees = [
        ...((body.teamAttendeeEmails as string[]) || []),
        body.contactEmail ? String(body.contactEmail) : "",
      ].filter(Boolean)
      const eventId = await upsertM365Event(token, {
        title: `Follow-up: ${company}`,
        description,
        date: followUpDate,
        attendeeEmails: attendees,
        existingEventId: body.existingEventId ? String(body.existingEventId) : undefined,
      })
      return json({ eventId })
    }

    if (action === "deleteEvent") {
      const token = await requireToken()
      await deleteM365Event(token, String(body.eventId || ""))
      return json({ ok: true })
    }

    if (action === "createTeamMeeting") {
      const token = await requireToken()
      const title = String(body.title || "").trim()
      const date = String(body.date || "").slice(0, 10)
      if (!title) return json({ error: "Meeting title is required" }, 400)
      if (!date) return json({ error: "Meeting date is required" }, 400)
      const description = [String(body.description || ""), body.crmCompany ? `CRM: ${body.crmCompany}` : ""]
        .filter(Boolean)
        .join("\n")
      const eventId = await upsertM365Event(token, {
        title,
        description,
        date,
        startHour: typeof body.startHour === "number" ? body.startHour : 10,
        startMinute: typeof body.startMinute === "number" ? body.startMinute : 0,
        durationMinutes: typeof body.durationMinutes === "number" ? body.durationMinutes : 30,
        attendeeEmails: (body.attendeeEmails as string[]) || [],
        location: body.location ? String(body.location) : undefined,
      })
      return json({ eventId })
    }

    if (action === "listEvents") {
      const token = await requireToken()
      const start = String(body.start || "")
      const end = String(body.end || "")
      if (!start || !end) return json({ error: "start and end ISO times are required" }, 400)
      const events = await listM365Events(token, start, end)
      return json({ events })
    }

    if (action === "listCalendars") {
      return json({ calendars: [{ uid: "me", name: "Default", isDefault: true }] })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    console.error("m365-mail-calendar action failed", action, e)
    return json({ error: e instanceof Error ? e.message : "Microsoft 365 request failed" }, 400)
  }
}))
