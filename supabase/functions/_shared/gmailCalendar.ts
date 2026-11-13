// Gmail send + Google Calendar (Phase A). Prefer dedicated
// GOOGLE_MAIL_CLIENT_ID / GOOGLE_MAIL_CLIENT_SECRET; fall back to Drive's
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Refresh token lives in gmail_connection.
// Scopes are sensitive only — no gmail.readonly (Phase B / COMPLIANCE_NOTES).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { googleApp } from "./googleDrive.ts"

/** OAuth client for Gmail/Calendar — dedicated secrets first, then Drive secrets. */
export function gmailGoogleApp(): { clientId: string; clientSecret: string } | null {
  const mailId = (Deno.env.get("GOOGLE_MAIL_CLIENT_ID") || "").trim()
  const mailSecret = (Deno.env.get("GOOGLE_MAIL_CLIENT_SECRET") || "").trim()
  if (mailId && mailSecret) return { clientId: mailId, clientSecret: mailSecret }
  return googleApp()
}

/** @deprecated Prefer gmailGoogleApp — kept for callers that still import googleApp. */
export { gmailGoogleApp as googleApp }

export const GMAIL_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ")

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1"
const CALENDAR_API = "https://www.googleapis.com/calendar/v3"

export type GmailConnection = {
  refresh_token: string
  account_email: string
}

export function gmailConsentUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  })
  return `${AUTH_URL}?${q}`
}

async function googleJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = body.error as { message?: string } | string | undefined
    const msg =
      typeof err === "string"
        ? `${err}${body.error_description ? `: ${body.error_description}` : ""}`
        : err?.message
    throw new Error(`Google answered ${res.status}${msg ? `: ${msg}` : ""}`)
  }
  return body
}

export async function exchangeGmailCode(
  app: { clientId: string; clientSecret: string },
  code: string,
  redirectUri: string,
) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await googleJson(res)
  return { accessToken: String(body.access_token || ""), refreshToken: String(body.refresh_token || "") }
}

export async function gmailAccessToken(
  app: { clientId: string; clientSecret: string },
  refreshToken: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await googleJson(res).catch((e) => {
    throw new Error(`Google sign in failed. Connect Gmail again in Settings. (${(e as Error).message})`)
  })
  return String(body.access_token || "")
}

export async function gmailAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${GMAIL_API}/users/me/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await googleJson(res)
  return String(body.emailAddress || "")
}

export async function loadGmailConnection(sb: SupabaseClient): Promise<GmailConnection | null> {
  const { data } = await sb.from("gmail_connection").select("refresh_token, account_email").eq("id", 1).maybeSingle()
  const row = data as GmailConnection | null
  if (!row?.refresh_token) return null
  return row
}

function b64url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function encodeRawMail(opts: { from: string; to: string; subject: string; body: string }): string {
  const subject = /^[\x00-\x7F]*$/.test(opts.subject)
    ? opts.subject
    : `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`
  const mime = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.body,
  ].join("\r\n")
  return b64url(new TextEncoder().encode(mime))
}

export async function sendGmailMessage(
  accessToken: string,
  opts: { to: string; subject: string; body: string; fromAddress?: string },
): Promise<void> {
  const profile = await gmailAccountEmail(accessToken)
  const from = opts.fromAddress?.trim() || profile
  const raw = encodeRawMail({ from, to: opts.to, subject: opts.subject, body: opts.body })
  const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(30_000),
  })
  await googleJson(res)
}

function eventDateTime(date: string, startHour = 10, durationMinutes = 30, startMinute = 0) {
  const day = date.slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, "0")
  const start = `${day}T${pad(startHour)}:${pad(startMinute)}:00`
  const endMin = startHour * 60 + startMinute + durationMinutes
  const endH = Math.floor(endMin / 60)
  const endM = endMin % 60
  const end = `${day}T${pad(endH)}:${pad(endM)}:00`
  // Asia/Dubai is the company default; Google accepts timeZone on dateTime.
  return {
    start: { dateTime: start, timeZone: "Asia/Dubai" },
    end: { dateTime: end, timeZone: "Asia/Dubai" },
  }
}

export async function upsertCalendarEvent(
  accessToken: string,
  input: {
    title: string
    description?: string
    date: string
    startHour?: number
    startMinute?: number
    durationMinutes?: number
    attendeeEmails?: string[]
    existingEventId?: string
    location?: string
  },
): Promise<string> {
  const { start, end } = eventDateTime(
    input.date,
    input.startHour ?? 10,
    input.durationMinutes ?? 30,
    input.startMinute ?? 0,
  )
  const attendees = (input.attendeeEmails || [])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => ({ email }))
  const payload: Record<string, unknown> = {
    summary: input.title,
    description: input.description || "",
    start,
    end,
  }
  if (input.location?.trim()) payload.location = input.location.trim()
  if (attendees.length) {
    payload.attendees = attendees
    payload.guestsCanModify = false
  }

  const calId = "primary"
  if (input.existingEventId) {
    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(input.existingEventId)}?sendUpdates=all`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (res.status === 404 || res.status === 410) {
      return createCalendarEvent(accessToken, calId, payload)
    }
    const body = await googleJson(res)
    return String(body.id || input.existingEventId)
  }
  return createCalendarEvent(accessToken, calId, payload)
}

async function createCalendarEvent(
  accessToken: string,
  calId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events?sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    },
  )
  const body = await googleJson(res)
  const id = String(body.id || "")
  if (!id) throw new Error("Google Calendar created event but returned no id")
  return id
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  if (!eventId) return
  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (res.status === 404 || res.status === 410 || res.status === 204) return
  if (!res.ok) await googleJson(res)
}

export async function listPrimaryEvents(
  accessToken: string,
  start: string,
  end: string,
): Promise<
  Array<{
    uid: string
    title: string
    startAt: string
    endAt: string
    isAllDay: boolean
    organizer: string
    attendees: { email: string; status?: string }[]
    description: string
  }>
> {
  const q = new URLSearchParams({
    timeMin: start,
    timeMax: end,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  })
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  })
  const body = await googleJson(res)
  const items = (body.items as Array<Record<string, unknown>> | undefined) || []
  return items.map((ev) => {
    const startObj = (ev.start || {}) as { dateTime?: string; date?: string }
    const endObj = (ev.end || {}) as { dateTime?: string; date?: string }
    const isAllDay = Boolean(startObj.date && !startObj.dateTime)
    const attendees = ((ev.attendees as Array<{ email?: string; responseStatus?: string }>) || [])
      .filter((a) => a.email)
      .map((a) => ({ email: String(a.email), status: a.responseStatus }))
    const organizer = (ev.organizer as { email?: string } | undefined)?.email || ""
    return {
      uid: String(ev.id || ""),
      title: String(ev.summary || "(No title)"),
      startAt: String(startObj.dateTime || startObj.date || ""),
      endAt: String(endObj.dateTime || endObj.date || ""),
      isAllDay,
      organizer,
      attendees,
      description: String(ev.description || ""),
    }
  })
}
