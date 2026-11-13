// Microsoft 365 Phase A: delegated Mail.Send + Calendars.ReadWrite.
// Secrets: MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (+ optional MICROSOFT_TENANT_ID).
// See docs/COMPLIANCE_NOTES.md § M365.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

const GRAPH = "https://graph.microsoft.com/v1.0"

export const M365_SCOPES = [
  "openid",
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
].join(" ")

export type M365Connection = {
  refresh_token: string
  account_email: string
}

export function m365App(): { clientId: string; clientSecret: string; tenant: string } | null {
  const clientId = (Deno.env.get("MICROSOFT_CLIENT_ID") || "").trim()
  const clientSecret = (Deno.env.get("MICROSOFT_CLIENT_SECRET") || "").trim()
  const tenant = (Deno.env.get("MICROSOFT_TENANT_ID") || "common").trim() || "common"
  return clientId && clientSecret ? { clientId, clientSecret, tenant } : null
}

function authBase(tenant: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`
}

export function m365ConsentUrl(
  app: { clientId: string; tenant: string },
  redirectUri: string,
  state: string,
): string {
  const q = new URLSearchParams({
    client_id: app.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: M365_SCOPES,
    state,
    prompt: "consent",
  })
  return `${authBase(app.tenant)}/authorize?${q}`
}

async function graphJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = body.error as { message?: string; code?: string } | string | undefined
    const msg =
      typeof err === "string"
        ? err
        : err?.message || (body.error_description as string | undefined) || JSON.stringify(body).slice(0, 200)
    throw new Error(`Microsoft Graph answered ${res.status}${msg ? `: ${msg}` : ""}`)
  }
  return body
}

export async function exchangeM365Code(
  app: { clientId: string; clientSecret: string; tenant: string },
  code: string,
  redirectUri: string,
) {
  const res = await fetch(`${authBase(app.tenant)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: M365_SCOPES,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await graphJson(res)
  return {
    accessToken: String(body.access_token || ""),
    refreshToken: String(body.refresh_token || ""),
  }
}

export async function m365AccessToken(
  app: { clientId: string; clientSecret: string; tenant: string },
  refreshToken: string,
): Promise<string> {
  const res = await fetch(`${authBase(app.tenant)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: M365_SCOPES,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await graphJson(res).catch((e) => {
    throw new Error(`Microsoft sign in failed. Connect Microsoft 365 again in Settings. (${(e as Error).message})`)
  })
  return String(body.access_token || "")
}

export async function m365AccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await graphJson(res)
  return String(body.mail || body.userPrincipalName || "")
}

export async function loadM365Connection(sb: SupabaseClient): Promise<M365Connection | null> {
  const { data } = await sb.from("m365_connection").select("refresh_token, account_email").eq("id", 1).maybeSingle()
  const row = data as M365Connection | null
  if (!row?.refresh_token) return null
  return row
}

export async function sendM365Mail(
  accessToken: string,
  opts: { to: string; subject: string; body: string; fromAddress?: string },
): Promise<void> {
  const payload = {
    message: {
      subject: opts.subject,
      body: { contentType: "Text", content: opts.body },
      toRecipients: [{ emailAddress: { address: opts.to } }],
      ...(opts.fromAddress?.trim()
        ? { from: { emailAddress: { address: opts.fromAddress.trim() } } }
        : {}),
    },
    saveToSentItems: true,
  }
  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status === 202 || res.status === 200) {
    await res.body?.cancel()
    return
  }
  await graphJson(res)
}

function eventTimes(date: string, startHour = 10, durationMinutes = 30, startMinute = 0) {
  const day = date.slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, "0")
  const start = `${day}T${pad(startHour)}:${pad(startMinute)}:00`
  const endMin = startHour * 60 + startMinute + durationMinutes
  const end = `${day}T${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00`
  return {
    start: { dateTime: start, timeZone: "Asia/Dubai" },
    end: { dateTime: end, timeZone: "Asia/Dubai" },
  }
}

export async function upsertM365Event(
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
  const { start, end } = eventTimes(
    input.date,
    input.startHour ?? 10,
    input.durationMinutes ?? 30,
    input.startMinute ?? 0,
  )
  const attendees = (input.attendeeEmails || [])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address }, type: "required" }))
  const payload: Record<string, unknown> = {
    subject: input.title,
    body: { contentType: "Text", content: input.description || "" },
    start,
    end,
  }
  if (input.location?.trim()) payload.location = { displayName: input.location.trim() }
  if (attendees.length) payload.attendees = attendees

  if (input.existingEventId) {
    const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(input.existingEventId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status === 404) return createM365Event(accessToken, payload)
    const body = await graphJson(res)
    return String(body.id || input.existingEventId)
  }
  return createM365Event(accessToken, payload)
}

async function createM365Event(accessToken: string, payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${GRAPH}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  })
  const body = await graphJson(res)
  const id = String(body.id || "")
  if (!id) throw new Error("Microsoft Calendar created event but returned no id")
  return id
}

export async function deleteM365Event(accessToken: string, eventId: string): Promise<void> {
  if (!eventId) return
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 204 || res.status === 404) {
    await res.body?.cancel()
    return
  }
  if (!res.ok) await graphJson(res)
}

export async function listM365Events(
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
    startDateTime: start,
    endDateTime: end,
    $orderby: "start/dateTime",
    $top: "100",
  })
  const res = await fetch(`${GRAPH}/me/calendarView?${q}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="Asia/Dubai"',
    },
    signal: AbortSignal.timeout(30_000),
  })
  const body = await graphJson(res)
  const items = (body.value as Array<Record<string, unknown>> | undefined) || []
  return items.map((ev) => {
    const startObj = (ev.start || {}) as { dateTime?: string; timeZone?: string }
    const endObj = (ev.end || {}) as { dateTime?: string; timeZone?: string }
    const attendees = ((ev.attendees as Array<{
      emailAddress?: { address?: string }
      status?: { response?: string }
    }>) || [])
      .filter((a) => a.emailAddress?.address)
      .map((a) => ({
        email: String(a.emailAddress?.address),
        status: a.status?.response,
      }))
    const organizer = String(
      (ev.organizer as { emailAddress?: { address?: string } } | undefined)?.emailAddress?.address || "",
    )
    const bodyObj = (ev.body || {}) as { content?: string }
    return {
      uid: String(ev.id || ""),
      title: String(ev.subject || "(No title)"),
      startAt: String(startObj.dateTime || ""),
      endAt: String(endObj.dateTime || ""),
      isAllDay: Boolean(ev.isAllDay),
      organizer,
      attendees,
      description: String(bodyObj.content || ""),
    }
  })
}
