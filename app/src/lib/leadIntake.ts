import { normalizePhone } from './whatsapp'

export { nextAccountReference } from './accounts'

/**
 * Lead intake: website forms, WhatsApp click to chat links and the AI CRM
 * landing page all arrive through the lead-intake Edge Function, which
 * bundles this file (app/scripts/build-support-function.mjs). Only pure code
 * and web crypto here, so the app and the function agree.
 *
 * A lead becomes, or joins, a deal:
 *  - AI CRM leads (the landing page) open an AI CRM sales deal at Lead on an
 *    AI CRM account, matched on phone and then email, or a new one;
 *  - everything else opens a Lead in the CRM, matched the same way.
 * Every lead is also kept in website_inquiries with its source and UTM values.
 */

export type LeadChannel = 'website_form' | 'whatsapp' | 'landing_page'
export type LeadPipeline = 'ai_crm' | 'crm'

export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  website_form: 'Website form',
  whatsapp: 'WhatsApp',
  landing_page: 'AI CRM landing page',
}

export type LeadUtm = { source: string; medium: string; campaign: string; term: string; content: string }

export type Lead = {
  name: string
  company: string
  email: string
  phone: string
  message: string
  /** The website desk (RR Threads, RR Wanders...), when the form has one. */
  vertical: string
  channel: LeadChannel
  pipeline: LeadPipeline
  utm: LeadUtm
  page_url: string
}

/** Same limits as the website_inquiries "Public submit inquiry" policy. */
export const LEAD_LIMITS = { name: 200, company: 200, email: 320, phone: 50, vertical: 100, message: 5000, utm: 200, page: 500 } as const

/** Per minute for everyone, and per sender (hashed IP) in ten minutes. */
export const LEAD_RATE_LIMITS = { perMinute: 30, perSenderPer10Min: 5 } as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * Reads a posted lead. `website` is a hidden honeypot field: people leave it
 * empty, form-filling bots do not. Returns the reason when it is not usable.
 */
export function parseLead(raw: Record<string, unknown>): { lead: Lead } | { error: string; spam?: boolean } {
  if (str(raw.website, 500)) return { error: 'spam', spam: true }
  const utmRaw = (raw.utm && typeof raw.utm === 'object' ? raw.utm : raw) as Record<string, unknown>
  const pick = (k: string) => str(utmRaw[`utm_${k}`] ?? utmRaw[k], LEAD_LIMITS.utm)
  const channelRaw = str(raw.channel, 30)
  const channel: LeadChannel =
    channelRaw === 'whatsapp' || channelRaw === 'landing_page' || channelRaw === 'website_form' ? channelRaw : 'website_form'
  const pipelineRaw = str(raw.pipeline, 20)
  const pipeline: LeadPipeline =
    pipelineRaw === 'ai_crm' || pipelineRaw === 'crm' ? pipelineRaw : channel === 'landing_page' ? 'ai_crm' : 'crm'
  const lead: Lead = {
    name: str(raw.name, LEAD_LIMITS.name),
    company: str(raw.company, LEAD_LIMITS.company),
    email: str(raw.email, LEAD_LIMITS.email).toLowerCase(),
    phone: str(raw.phone, LEAD_LIMITS.phone),
    message: str(raw.message, LEAD_LIMITS.message),
    vertical: str(raw.vertical, LEAD_LIMITS.vertical),
    channel,
    pipeline,
    utm: { source: pick('source'), medium: pick('medium'), campaign: pick('campaign'), term: pick('term'), content: pick('content') },
    page_url: str(raw.page_url ?? raw.page, LEAD_LIMITS.page),
  }
  if (!lead.name && !lead.company) return { error: 'Give a name' }
  if (!lead.email && !lead.phone) return { error: 'Give a phone number or an email' }
  if (lead.email && !EMAIL_RE.test(lead.email)) return { error: 'That email does not look right' }
  if (lead.phone && lead.phone.replace(/\D/g, '').length < 7) return { error: 'That phone number looks too short' }
  return { lead }
}

/** How the lead is labelled as a source: the channel, then the UTM values that were given. */
export function leadSourceLabel(lead: Pick<Lead, 'channel' | 'utm'>): string {
  const u = lead.utm
  const sm = [u.source, u.medium].filter(Boolean).join(' / ')
  return [LEAD_CHANNEL_LABELS[lead.channel], sm, u.campaign].filter(Boolean).join(', ').slice(0, 200)
}

/** Digits with the country code, or '' when too short to match on. */
export function phoneKey(raw: string | null | undefined, countryCode = '971'): string {
  const digits = normalizePhone(String(raw || ''), countryCode)
  return digits.length >= 8 ? digits : ''
}

type ContactLike = { phone?: string | null; whatsapp?: string | null; email?: string | null }

/** The first contact with the lead's phone, else the first with its email. */
export function matchContact<T extends ContactLike>(contacts: T[], lead: Pick<Lead, 'phone' | 'email'>, countryCode = '971'): T | undefined {
  const phone = phoneKey(lead.phone, countryCode)
  if (phone) {
    const byPhone = contacts.find((c) => phoneKey(c.phone, countryCode) === phone || phoneKey(c.whatsapp, countryCode) === phone)
    if (byPhone) return byPhone
  }
  const email = lead.email.trim().toLowerCase()
  if (email) return contacts.find((c) => String(c.email || '').trim().toLowerCase() === email)
  return undefined
}

export type CrmLeadRow = {
  id: string
  pipeline_stage: string
  mobile_number: string
  office_number: string
  email_phone: string
  contacts?: { phone?: string; email?: string }[] | null
}

/** A CRM row with the lead's phone (on the row or any contact), else its email. Open rows first. */
export function matchCrm<T extends CrmLeadRow>(rows: T[], lead: Pick<Lead, 'phone' | 'email'>, countryCode = '971'): T | undefined {
  const flat = (r: T) => [
    { phone: r.mobile_number, email: r.email_phone },
    { phone: r.office_number, email: '' },
    { phone: r.email_phone, email: '' },
    ...(r.contacts || []).map((c) => ({ phone: c.phone || '', email: c.email || '' })),
  ]
  const open = (r: T) => r.pipeline_stage !== 'Won' && r.pipeline_stage !== 'Lost'
  const sorted = [...rows].sort((a, b) => Number(open(b)) - Number(open(a)))
  const phone = phoneKey(lead.phone, countryCode)
  if (phone) {
    const hit = sorted.find((r) => flat(r).some((c) => phoneKey(c.phone, countryCode) === phone))
    if (hit) return hit
  }
  const email = lead.email.trim().toLowerCase()
  if (email) return sorted.find((r) => flat(r).some((c) => String(c.email || '').trim().toLowerCase() === email))
  return undefined
}

// ---------------------------------------------------------------------------
// WhatsApp click to chat: the link goes through the function, which counts
// the click with its UTM values and sends the visitor on to WhatsApp.
// ---------------------------------------------------------------------------

/** The number click to chat links open. Only this number, never one from the link. */
export const LEAD_WHATSAPP_KEY = 'leadWhatsappNumber'
export const DEFAULT_LEAD_WHATSAPP = '971507008977'

export function whatsappRedirect(settings: Record<string, string | undefined>, text: string): string {
  const num = String(settings[LEAD_WHATSAPP_KEY] || DEFAULT_LEAD_WHATSAPP).replace(/\D/g, '') || DEFAULT_LEAD_WHATSAPP
  const msg = String(text || '').slice(0, 500)
  return `https://wa.me/${num}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`
}

// ---------------------------------------------------------------------------
// Who gets the lead
// ---------------------------------------------------------------------------

export const LEAD_OWNER_KEYS = {
  /** 'fixed' (the default) or 'round_robin'. */
  mode: 'leadOwnerMode',
  /** The fixed owner's app user id. */
  fixed: 'leadOwnerId',
  /** Comma separated app user ids taking turns. */
  pool: 'leadOwnerPool',
  /** Who got the last lead in the round robin. */
  last: 'leadOwnerLast',
} as const

/**
 * The owner for a new lead. Round robin goes to the next person in the pool
 * after the last one (skipping anyone no longer active); otherwise the fixed
 * owner. `last` is what to save so the next lead goes to the next person.
 */
export function pickLeadOwner(
  settings: Record<string, string | undefined>,
  activeUserIds: string[],
): { ownerId: string | null; last: string | null } {
  const active = new Set(activeUserIds)
  const fixed = settings[LEAD_OWNER_KEYS.fixed] || ''
  if (settings[LEAD_OWNER_KEYS.mode] === 'round_robin') {
    const pool = String(settings[LEAD_OWNER_KEYS.pool] || '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => id && active.has(id))
    if (pool.length) {
      const at = pool.indexOf(settings[LEAD_OWNER_KEYS.last] || '')
      const next = pool[(at + 1) % pool.length]
      return { ownerId: next, last: next }
    }
  }
  return { ownerId: fixed && active.has(fixed) ? fixed : null, last: null }
}

// ---------------------------------------------------------------------------
// Form tokens: a website form asks the function for one when it loads
// ---------------------------------------------------------------------------

/** A token is good from 3 seconds (people are slower than bots) to 2 hours after it was issued. */
export const FORM_TOKEN_MIN_MS = 3_000
export const FORM_TOKEN_MAX_MS = 2 * 60 * 60 * 1000

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function makeFormToken(secret: string, now: Date = new Date()): Promise<string> {
  const issued = String(now.getTime())
  return `${issued}.${await hmac(secret, `lead-form:${issued}`)}`
}

export async function formTokenProblem(token: string, secret: string, now: Date = new Date()): Promise<string | null> {
  const [issued, sig] = String(token || '').split('.')
  if (!issued || !sig || !/^\d{10,16}$/.test(issued)) return 'No form token'
  if (sig !== (await hmac(secret, `lead-form:${issued}`))) return 'Form token not valid'
  const age = now.getTime() - Number(issued)
  if (age < FORM_TOKEN_MIN_MS) return 'Sent too fast'
  if (age > FORM_TOKEN_MAX_MS) return 'Form token expired, reload the page'
  return null
}

/** A one way hash of the sender's address, for the per sender limit. */
export async function senderHash(ip: string, secret: string): Promise<string> {
  return (await hmac(secret, `lead-ip:${ip || 'unknown'}`)).slice(0, 32)
}

// ---------------------------------------------------------------------------
// New leads: dashboard and digest
// ---------------------------------------------------------------------------

export type IntakeRow = {
  id: string
  name: string
  email: string
  phone: string
  source: string
  channel: string
  status: string
  pipeline: string
  account_id: string | null
  crm_id: string
  deal_id: string
  matched: boolean
  created_at: string
}

export type NewLead = { id: string; name: string; detail: string; link: string; created_at: string }

/** Leads from the intake in the window, newest first, with a link to where they landed. */
export function newLeads(rows: IntakeRow[], since: Date): NewLead[] {
  return rows
    .filter((r) => r.created_at >= since.toISOString() && (r.status === 'converted' || r.status === 'new'))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => ({
      id: r.id,
      name: r.name || r.email || r.phone || 'New lead',
      detail: [r.source || LEAD_CHANNEL_LABELS[r.channel as LeadChannel] || 'Website', r.matched ? 'known contact' : 'new contact']
        .filter(Boolean)
        .join(', '),
      link: r.account_id ? `/accounts/${r.account_id}` : r.crm_id ? `/crm?edit=${r.crm_id}` : '/crm',
      created_at: r.created_at,
    }))
}

/**
 * Who sees the New leads panel: the same people the website_inquiries RLS
 * lets read leads (rr_is_staff: admin, manager, sales). The VA ('staff')
 * and viewers do not.
 */
export function canSeeLeads(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'sales'
}

/** Who may change who gets new leads. */
export function canSetLeadOwners(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager'
}
