// Payment reminder: one tap from the reminder list on Invoices sends the
// prepared 3, 7 or 14 day reminder by email (Zoho Mail) or WhatsApp (a Meta
// template). Never automatic: only a signed in admin, manager or sales person
// pressing Send calls it.
//
// Each stage goes out once per invoice. The reminder is recorded in
// invoice_reminders first, as the caller (so the audit log names them); the
// unique key (invoice_id, stage) refuses a second one. If sending then fails,
// the record is removed so the button can be pressed again. After sending it
// writes a line on the account timeline.
//
// Rules and wording live in app/src/lib/paymentReminder.ts (bundled), the same
// as the app shows. Secrets for WhatsApp: WHATSAPP_PHONE_NUMBER_ID,
// META_ACCESS_TOKEN, optional PAYMENT_REMINDER_WHATSAPP_TEMPLATE (default
// rr_payment_reminder), PAYMENT_REMINDER_WHATSAPP_LANGUAGE (default en),
// META_GRAPH_VERSION. Email needs no secret.
// Deploy: Actions > Deploy Edge Functions (verify_jwt stays on; the function
// also checks the role itself). Steps: docs/payment-reminders.md.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  dueReminder,
  formatAED,
  reminderMessage,
  reminderRecipient,
  reminderTimelineText,
  reminderWhatsAppValues,
} from "./paymentReminder.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { zohoMailer } from "../_shared/zohoMail.ts"

type Channel = "email" | "whatsapp"
type Contact = { id: string; name: string; email: string; phone: string; whatsapp: string; is_primary: boolean }
type Due = { stage: 3 | 7 | 14; daysLate: number; dueDate: string }

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
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

async function sendWhatsApp(to: string, values: string[]): Promise<string | null> {
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || ""
  const token = Deno.env.get("META_ACCESS_TOKEN") || ""
  const version = Deno.env.get("META_GRAPH_VERSION") || "v21.0"
  const template = Deno.env.get("PAYMENT_REMINDER_WHATSAPP_TEMPLATE") || "rr_payment_reminder"
  const language = Deno.env.get("PAYMENT_REMINDER_WHATSAPP_LANGUAGE") || "en"
  const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: language },
        components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }],
      },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (res.ok) return null
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  return body.error?.message || `WhatsApp answered ${res.status}`
}

Deno.serve(withErrorLog("payment-reminder", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Only a signed in admin, manager or sales person, as on the reminder list.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  const { data: allowed } = await userDb.rpc("rr_is_staff")
  if (allowed !== true) return json({ error: "Only admins, managers and sales can send payment reminders" }, 403)
  const sentBy = who.user.email || ""
  const { data: appUserId } = await userDb.rpc("rr_current_user_id")

  const body = (await req.json().catch(() => ({}))) as { invoice_id?: string; channel?: string; contact_id?: string }
  const channel = body.channel as Channel
  if (!body.invoice_id || (channel !== "email" && channel !== "whatsapp")) {
    return json({ error: "invoice_id and channel (email or whatsapp) are needed" }, 400)
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: invoice } = await sb.from("invoices").select("*").eq("id", body.invoice_id).maybeSingle()
  if (!invoice) return json({ error: "Invoice not found" }, 404)

  const [{ data: payments }, { data: sent }, { data: settingRows }] = await Promise.all([
    sb.from("payment_log").select("amount").eq("invoice_ref", invoice.reference_number),
    sb.from("invoice_reminders").select("stage").eq("invoice_id", invoice.id),
    sb.from("app_settings").select("key, value").in("key", ["companyName", "whatsappCountryCode"]),
  ])
  const paid = (payments || []).reduce((s: number, p: { amount: number }) => s + (Number(p.amount) || 0), 0)
  const balance = Math.max(0, Math.round((Number(invoice.amount) - paid) * 100) / 100)
  const due = dueReminder(invoice, balance, (sent || []).map((r: { stage: number }) => r.stage)) as Due | null
  if (!due) return json({ error: "No reminder is due for this invoice now (paid, not late yet, or this stage was already sent).", code: "not_due" }, 409)

  const settings: Record<string, string> = {}
  for (const r of (settingRows || []) as { key: string; value: string }[]) settings[r.key] = String(r.value ?? "")
  const company = settings.companyName || "Red Reach Middle East FZE"

  const { data: contacts } = invoice.account_id
    ? await sb.from("account_contacts").select("id, name, email, phone, whatsapp, is_primary").eq("account_id", invoice.account_id)
    : { data: [] }
  const recipient = reminderRecipient((contacts || []) as Contact[], channel, body.contact_id, settings.whatsappCountryCode || "971") as
    | { contact: Contact; to: string }
    | null
  if (!recipient) {
    return json({ error: `No contact with ${channel === "email" ? "an email address" : "a WhatsApp number"} on this account.`, code: "no_recipient" }, 422)
  }

  // Check the channel is set up before claiming the stage.
  const mailer = channel === "email" ? await zohoMailer(sb) : null
  if (channel === "email" && !mailer) {
    return json({ error: "Zoho Mail is not connected (Settings, Zoho, Mail set to yes).", code: "email_not_configured" }, 422)
  }
  if (channel === "whatsapp" && (!Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || !Deno.env.get("META_ACCESS_TOKEN"))) {
    return json({ error: "WhatsApp sending is not set up yet.", code: "whatsapp_not_configured" }, 422)
  }

  // Claim the stage as the caller: the unique key stops a second send, and the audit log names them.
  const claimId = crypto.randomUUID()
  const claim = await userDb.from("invoice_reminders").insert({
    id: claimId,
    invoice_id: invoice.id,
    stage: due.stage,
    channel,
    sent_by: sentBy,
    sent_at: new Date().toISOString(),
  })
  if (claim.error) {
    if (claim.error.code === "23505") return json({ error: "This reminder was already sent.", code: "already_sent" }, 409)
    return json({ error: `Could not record the reminder: ${claim.error.message}` }, 500)
  }

  const balanceText = formatAED(balance) as string
  const parts = {
    stage: due.stage,
    contactName: recipient.contact.name || "",
    reference: invoice.reference_number,
    balanceText,
    dueDate: due.dueDate,
    daysLate: due.daysLate,
    companyName: company,
  }
  let failure: string | null = null
  try {
    if (channel === "email") {
      const { subject, body: text } = reminderMessage(parts) as { subject: string; body: string }
      const result = await mailer!([{ to: recipient.to, subject, body: text }])
      if (!result.sent) failure = result.errors.join("; ") || "Email was not sent"
    } else {
      failure = await sendWhatsApp(recipient.to, reminderWhatsAppValues(parts) as string[])
    }
  } catch (e) {
    failure = (e as Error).message
  }
  if (failure) {
    // Free the stage again so the button can be pressed once it is fixed.
    await sb.from("invoice_reminders").delete().eq("id", claimId)
    return json({ error: `Not sent: ${failure}`.slice(0, 300), code: "send_failed" }, 502)
  }

  if (invoice.account_id) {
    await sb.from("account_activities").insert({
      id: crypto.randomUUID(),
      account_id: invoice.account_id,
      user_id: typeof appUserId === "string" ? appUserId : null,
      user_email: sentBy,
      kind: "system",
      body: reminderTimelineText({ stage: due.stage, channel, to: recipient.to, reference: invoice.reference_number, balanceText, sentBy }),
      created_at: new Date().toISOString(),
    })
  }
  return json({ sent: true, stage: due.stage, channel, to: recipient.to })
}))
