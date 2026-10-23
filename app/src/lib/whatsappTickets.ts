/**
 * WhatsApp to tickets: client messages to the WhatsApp Business number open
 * or continue a support ticket, and replies typed on the ticket go back out
 * on WhatsApp.
 *
 * Shared by the app and the whatsapp-in / whatsapp-send Edge Functions
 * (bundled by app/scripts/build-support-function.mjs). Only pure code here.
 */
import { normalizePhone } from './whatsapp'

/** WhatsApp lets a business reply freely for 24 hours after the client's last message. */
export const SERVICE_WINDOW_HOURS = 24

/** Longest reply WhatsApp accepts in one text message. */
export const WHATSAPP_MAX_TEXT = 4096

export type InboundWhatsApp = {
  /** WhatsApp's message id (wamid...), kept as ticket_messages.external_id. */
  wamid: string
  /** The client's number, digits only with country code. */
  from: string
  /** The name on the client's WhatsApp profile. */
  name: string
  /** When they sent it. */
  sentAt: string
  body: string
  phoneNumberId: string
}

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

export type WhatsAppStatus = { wamid: string; status: DeliveryStatus; error: string }

const DELIVERY_ORDER: DeliveryStatus[] = ['sent', 'delivered', 'read']

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  sent: 'Sent on WhatsApp',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not delivered',
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

const MEDIA_LABELS: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice note',
  voice: 'Voice note',
  document: 'Document',
  sticker: 'Sticker',
}

/** The text to show on the ticket for one WhatsApp message, or null to skip it (reactions, system notices). */
export function messageText(m: Obj): string | null {
  const type = str(m.type)
  if (type === 'text') return str(obj(m.text).body)
  if (type in MEDIA_LABELS) {
    const media = obj(m[type])
    const caption = str(media.caption) || str(media.filename)
    return `[${MEDIA_LABELS[type]}${caption ? `: ${caption}` : ''}] Open WhatsApp to see it.`
  }
  if (type === 'location') {
    const l = obj(m.location)
    const where = [str(l.name), str(l.address)].filter(Boolean).join(', ')
    return `[Location${where ? `: ${where}` : ''}] ${l.latitude ?? ''},${l.longitude ?? ''}`.trim()
  }
  if (type === 'contacts') return '[Contact card] Open WhatsApp to see it.'
  if (type === 'button') return str(obj(m.button).text)
  if (type === 'interactive') {
    const i = obj(m.interactive)
    return str(obj(i.button_reply).title) || str(obj(i.list_reply).title) || '[Reply to a menu]'
  }
  if (type === 'reaction' || type === 'system' || type === 'ephemeral') return null
  return '[A message RR Central cannot show] Open WhatsApp to see it.'
}

/** Reads Meta's webhook payload: new client messages and delivery updates for messages we sent. */
export function parseWebhook(payload: unknown): { messages: InboundWhatsApp[]; statuses: WhatsAppStatus[] } {
  const messages: InboundWhatsApp[] = []
  const statuses: WhatsAppStatus[] = []
  const entries = Array.isArray(obj(payload).entry) ? (obj(payload).entry as unknown[]) : []
  for (const entry of entries) {
    const changes = Array.isArray(obj(entry).changes) ? (obj(entry).changes as unknown[]) : []
    for (const change of changes) {
      const value = obj(obj(change).value)
      const phoneNumberId = str(obj(value.metadata).phone_number_id)
      const contacts = Array.isArray(value.contacts) ? (value.contacts as unknown[]).map(obj) : []
      for (const raw of Array.isArray(value.messages) ? (value.messages as unknown[]) : []) {
        const m = obj(raw)
        const from = str(m.from).replace(/\D/g, '')
        const wamid = str(m.id)
        const body = messageText(m)
        if (!from || !wamid || body === null) continue
        const contact = contacts.find((c) => str(c.wa_id) === from) ?? contacts[0] ?? {}
        const ts = Number(m.timestamp)
        messages.push({
          wamid: wamid.slice(0, 200),
          from: from.slice(0, 20),
          name: str(obj(contact.profile).name).slice(0, 200),
          sentAt: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
          body: body.slice(0, 20000),
          phoneNumberId,
        })
      }
      for (const raw of Array.isArray(value.statuses) ? (value.statuses as unknown[]) : []) {
        const s = obj(raw)
        const status = str(s.status) as DeliveryStatus
        if (!str(s.id) || !(status in DELIVERY_LABELS)) continue
        const err = Array.isArray(s.errors) ? obj((s.errors as unknown[])[0]) : {}
        statuses.push({
          wamid: str(s.id).slice(0, 200),
          status,
          error: (str(obj(err.error_data).details) || str(err.title) || str(err.message)).slice(0, 300),
        })
      }
    }
  }
  return { messages, statuses }
}

/** Whether a delivery update should replace the one we have: never go backwards, and failed always shows. */
export function nextDeliveryStatus(current: string, incoming: DeliveryStatus): DeliveryStatus | null {
  if (incoming === 'failed') return current === 'failed' ? null : 'failed'
  if (current === 'failed') return null
  const was = DELIVERY_ORDER.indexOf(current as DeliveryStatus)
  return DELIVERY_ORDER.indexOf(incoming) > was ? incoming : null
}

/** Does this saved contact number belong to the WhatsApp sender? */
export function phoneMatches(saved: string, waFrom: string, countryCode = '971'): boolean {
  // 00 is the international prefix, as in 00971...
  const a = normalizePhone(String(saved || '').replace(/^\s*00/, ''), countryCode)
  return Boolean(a) && a === waFrom.replace(/\D/g, '')
}

/** A subject for a new ticket: the first line of the first message. */
export function ticketSubject(body: string): string {
  const line = body.split('\n').map((l) => l.trim()).find(Boolean) || ''
  if (!line || line.startsWith('[')) return 'WhatsApp message'
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}...` : line
}

/** Can we still send a free form reply? Only within 24 hours of the client's last message. */
export function serviceWindow(lastClientMessageAt: string | null, now: Date = new Date()): {
  open: boolean
  closesAt: string | null
} {
  if (!lastClientMessageAt) return { open: false, closesAt: null }
  const closes = Date.parse(lastClientMessageAt) + SERVICE_WINDOW_HOURS * 3_600_000
  return { open: closes > now.getTime(), closesAt: new Date(closes).toISOString() }
}

/** The request body for Meta's send message API. */
export function textMessagePayload(to: string, body: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/\D/g, ''),
    type: 'text',
    text: { body: body.slice(0, WHATSAPP_MAX_TEXT), preview_url: false },
  }
}

/** Checks Meta's X-Hub-Signature-256 header against the raw request body. */
export async function validSignature(rawBody: string, header: string, appSecret: string): Promise<boolean> {
  const sent = /^sha256=([0-9a-f]{64})$/i.exec(header.trim())?.[1]?.toLowerCase()
  if (!sent || !appSecret) return false
  const enc = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(rawBody)))
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
  // Constant time compare.
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sent.charCodeAt(i)
  return diff === 0
}

// For whatsapp-in, which opens tickets with the same SLA clock as the app.
export { addWorkingHours, calendarFromSettings, slaHoursFor } from './sla'
