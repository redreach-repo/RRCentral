/**
 * The client portal: what an AI CRM client sees about their own account
 * (tickets, build progress, usage against plan and the monthly report).
 * Shared by the app (local mode and staff preview) and the client-portal
 * Edge Function (bundled by app/scripts/build-support-function.mjs), so the
 * portal only ever shows the fields chosen here. Only pure modules are imported.
 *
 * Clients open the portal with a private link. The link carries a random
 * token; only its SHA-256 hash is stored (portal_access.token_hash).
 *
 * From the portal a client can also accept a quote that has an accept link,
 * open an invoice's card payment link, add a message to an open ticket and
 * upload a file to their account (Wave 4, PR P).
 */
import { addMonths, format, parseISO, subMonths } from 'date-fns'
import {
  BUILD_STAGE_STATUSES,
  TIME_CATEGORIES,
  buildProgress,
  calculateOverage,
  currentContract,
  hoursInMonth,
  monthKey,
  monthLabel,
  orderedStages,
  stageLabel,
  type DeliveryRates,
} from './delivery'
import { invoiceDueDate } from './contractBilling'
import { acceptableStatus, acceptLinkState } from './quoteAccept'
import { slaState } from './sla'
import { TICKET_STATUSES, isOpenTicket, resolvedInMonth } from './support'
import type {
  Account,
  BuildStage,
  Contract,
  DeliveryPackage,
  Requirement,
  Ticket,
  TimeEntry,
  UsageRecord,
} from './types'

/** How long a new link works for. */
export const PORTAL_LINK_MONTHS = 12
/** How many past months the report picker offers. */
export const PORTAL_REPORT_MONTHS = 6

// ---- Tokens ----

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A new random token for a portal link: 32 bytes, URL safe. */
export function newPortalToken(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Tokens look like 43 URL safe characters. Anything else is refused before any lookup. */
export function isPortalToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}

/** SHA-256 of the token, as stored in portal_access.token_hash. */
export async function hashPortalToken(token: string): Promise<string> {
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
}

/** The link a client opens. The token sits after # so it never reaches a server log. */
export function portalLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/portal#${token}`
}

export type PortalAccessRow = {
  id: string
  account_id: string
  expires_at: string | null
  revoked_at: string | null
}

export function portalAccessState(row: Pick<PortalAccessRow, 'expires_at' | 'revoked_at'>, now: Date = new Date()): 'active' | 'revoked' | 'expired' {
  if (row.revoked_at) return 'revoked'
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) return 'expired'
  return 'active'
}

export function portalExpiry(now: Date = new Date()): string {
  return addMonths(now, PORTAL_LINK_MONTHS).toISOString()
}

// ---- What the client sees ----

export type PortalTicket = { id: string; subject: string; status: string; opened: string; note: string; late: boolean }
export type PortalQuote = {
  id: string
  reference: string
  date: string | null
  validUntil: string | null
  amount: number
  currency: string
  /** waiting: can be accepted now. accepted: done. */
  state: 'waiting' | 'accepted'
  acceptedBy: string
  acceptedOn: string | null
  hasPdf: boolean
}
export type PortalInvoice = {
  id: string
  reference: string
  date: string | null
  due: string | null
  amount: number
  currency: string
  balance: number
  paid: boolean
  /** The card payment link, while there is money owing and one was made. */
  payUrl: string | null
}
export type PortalUpload = { filename: string; size: string; uploaded: string; saved: boolean }
export type PortalUsage = {
  month: string
  label: string
  whatsappUsed: number
  whatsappIncluded: number
  /** Share of the included WhatsApp used, 0 to 100 and above. Null with no plan. */
  whatsappPercent: number | null
  aiUsd: number
  aiCapUsd: number | null
  leadCreditsUsd: number
  leadCreditsIncludedUsd: number | null
  /** Estimated charge above the plan, AED excluding VAT. */
  aboveAed: number
}
export type PortalReport = {
  month: string
  label: string
  hours: number
  targetHours: number | null
  hoursByWork: { label: string; hours: number }[]
  ticketsOpened: number
  ticketsResolved: { subject: string; resolved: string }[]
  answeredOnTime: number
  answered: number
  usage: PortalUsage | null
  nextMonthLabel: string
  comingNext: string[]
}
export type PortalView = {
  companyName: string
  account: { name: string; reference: string }
  plan: {
    packageName: string
    targetHours: number
    includedWhatsapp: number
    supportResponse: string
    termStart: string | null
    termEnd: string | null
  } | null
  build: {
    done: number
    total: number
    percent: number
    current: string
    live: boolean
    stages: { label: string; status: string; due: string | null }[]
  }
  openTickets: PortalTicket[]
  quotes: PortalQuote[]
  invoices: PortalInvoice[]
  uploads: PortalUpload[]
  recentlyResolved: { subject: string; resolved: string }[]
  usage: PortalUsage[]
  reportMonths: { month: string; label: string }[]
  report: PortalReport
}

export type PortalInput = {
  now: Date
  /** Report month, `YYYY-MM-01`. Defaults to this month; limited to the last few months. */
  month?: string | null
  companyName: string
  account: Pick<Account, 'name' | 'reference'>
  contracts: Contract[]
  packages: DeliveryPackage[]
  stages: BuildStage[]
  requirements: Pick<Requirement, 'title' | 'status' | 'is_change_request'>[]
  tickets: (Pick<Ticket, 'subject' | 'status' | 'created_at' | 'sla_due_at' | 'first_response_at' | 'resolved_at'> & { id?: string })[]
  /** Quotes for this account that Red Reach sent with an accept link (optional). */
  quotes?: PortalQuoteRow[]
  /** This account's invoices and the payments logged against them (optional). */
  invoices?: PortalInvoiceRow[]
  payments?: { invoice_ref: string; amount: number }[]
  uploads?: PortalUploadRow[]
  usage: UsageRecord[]
  entries: Pick<TimeEntry, 'date' | 'hours' | 'category'>[]
  rates: DeliveryRates
}

export type PortalQuoteRow = {
  id: string
  reference_number: string
  date: string | null
  valid_until: string | null
  amount: number
  status: string
  quotation_currency?: string | null
  currency?: string | null
  links: { expires_at: string | null; revoked_at: string | null; accepted_at: string | null; accepted_name: string; has_pdf: boolean }[]
}
export type PortalInvoiceRow = {
  id: string
  reference_number: string
  date: string | null
  amount: number
  status: string
  payment_status: string
  payment_terms: string
  currency?: string | null
  pay_link_url?: string | null
}
export type PortalUploadRow = { filename: string; size_bytes: number; created_at: string; status: string }

const day = (iso: string) => format(parseISO(iso.slice(0, 10)), 'd MMM yyyy')
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** The months the report can show, newest first. */
export function reportMonths(now: Date): string[] {
  return Array.from({ length: PORTAL_REPORT_MONTHS }, (_, i) => monthKey(subMonths(now, i)))
}

function usageFor(month: string, usage: UsageRecord[], pkg: DeliveryPackage | null, rates: DeliveryRates): PortalUsage | null {
  const row = usage.find((u) => monthKey(u.month) === month)
  if (!row) return null
  const used = Number(row.whatsapp_marketing_count || 0) + Number(row.whatsapp_service_count || 0)
  const over = pkg ? calculateOverage(row, pkg, rates) : null
  const included = pkg ? Number(pkg.included_whatsapp || 0) : 0
  return {
    month,
    label: monthLabel(month),
    whatsappUsed: used,
    whatsappIncluded: included,
    whatsappPercent: included > 0 ? Math.round((used / included) * 100) : null,
    aiUsd: round2(Number(row.ai_cost_usd || 0)),
    aiCapUsd: pkg?.ai_cap_usd ?? null,
    leadCreditsUsd: round2(Number(row.lead_credits_cost_usd || 0)),
    leadCreditsIncludedUsd: pkg?.included_lead_credits_usd ?? null,
    aboveAed: over ? over.totalAed : 0,
  }
}

function ticketNote(t: PortalInput['tickets'][number], now: Date): { note: string; late: boolean } {
  if (t.first_response_at) return { note: 'We have replied', late: false }
  const state = slaState(t, now)
  if (t.status === 'waiting_on_client') return { note: 'Waiting for your reply', late: false }
  if (state === 'breached') return { note: 'Reply overdue, we are on it', late: true }
  if (t.sla_due_at) return { note: `Reply due by ${format(new Date(t.sla_due_at), 'd MMM, HH:mm')}`, late: false }
  return { note: 'Received', late: false }
}

export function buildPortalView(input: PortalInput): PortalView {
  const { now } = input
  const contract = currentContract(input.contracts)
  const pkg = input.packages.find((p) => p.id === contract?.package_id) ?? null
  const months = reportMonths(now)
  const month = input.month && months.includes(input.month) ? input.month : months[0]

  const progress = buildProgress(input.stages)
  const statusLabel = (s: string) => BUILD_STAGE_STATUSES.find((o) => o.value === s)?.label ?? s
  const ticketStatus = (s: string) => TICKET_STATUSES.find((o) => o.value === s)?.label ?? s

  const openTickets = input.tickets
    .filter(isOpenTicket)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((t) => ({ id: t.id || '', subject: t.subject || 'No subject', status: ticketStatus(t.status), opened: day(t.created_at), ...ticketNote(t, now) }))
  const since = subMonths(now, 2).toISOString()
  const recentlyResolved = input.tickets
    .filter((t) => t.resolved_at && t.resolved_at >= since)
    .sort((a, b) => String(b.resolved_at).localeCompare(String(a.resolved_at)))
    .slice(0, 10)
    .map((t) => ({ subject: t.subject || 'No subject', resolved: day(String(t.resolved_at)) }))

  const monthEntries = input.entries.filter((e) => monthKey(e.date) === month)
  const resolved = resolvedInMonth(input.tickets, month)
  const answered = resolved.filter((t) => t.first_response_at && t.sla_due_at)
  const openItems = input.requirements.filter((r) => r.status === 'open' || r.status === 'agreed')

  return {
    companyName: input.companyName,
    account: { name: input.account.name, reference: input.account.reference },
    plan: pkg
      ? {
          packageName: pkg.name,
          targetHours: Number(pkg.target_hours || 0),
          includedWhatsapp: Number(pkg.included_whatsapp || 0),
          supportResponse: pkg.support_response,
          termStart: contract?.term_start ?? null,
          termEnd: contract?.term_end ?? null,
        }
      : null,
    build: {
      ...progress,
      live: progress.done === progress.total,
      stages: orderedStages(input.stages).map((s) => ({
        label: stageLabel(s.stage),
        status: statusLabel(s.status),
        due: 'due_date' in s && s.due_date ? day(s.due_date) : null,
      })),
    },
    openTickets,
    quotes: portalQuotes(input.quotes || [], now),
    invoices: portalInvoices(input.invoices || [], input.payments || []),
    uploads: (input.uploads || []).slice(0, 20).map((u) => ({
      filename: u.filename,
      size: sizeLabel(u.size_bytes),
      uploaded: day(u.created_at),
      saved: u.status === 'in_workdrive',
    })),
    recentlyResolved,
    usage: months
      .slice(0, 2)
      .map((m) => usageFor(m, input.usage, pkg, input.rates))
      .filter((u): u is PortalUsage => u !== null),
    reportMonths: months.map((m) => ({ month: m, label: monthLabel(m) })),
    report: {
      month,
      label: monthLabel(month),
      hours: hoursInMonth(input.entries, month),
      targetHours: pkg ? Number(pkg.target_hours || 0) : null,
      hoursByWork: TIME_CATEGORIES.map((c) => ({
        label: c.label,
        hours: round2(monthEntries.filter((e) => e.category === c.value).reduce((s, e) => s + Number(e.hours || 0), 0)),
      })).filter((c) => c.hours > 0),
      ticketsOpened: input.tickets.filter((t) => monthKey(t.created_at) === month).length,
      ticketsResolved: resolved.map((t) => ({ subject: t.subject || 'No subject', resolved: day(String(t.resolved_at)) })),
      answeredOnTime: answered.filter((t) => String(t.first_response_at) <= String(t.sla_due_at)).length,
      answered: answered.length,
      usage: usageFor(month, input.usage, pkg, input.rates),
      nextMonthLabel: monthLabel(monthKey(addMonths(parseISO(month), 1))),
      comingNext: [
        ...(progress.done < progress.total ? [`Move the build forward: ${progress.current}`] : []),
        ...openItems.slice(0, 6).map((r) => `${r.title}${r.is_change_request ? ' (change request)' : ''}`),
      ],
    },
  }
}

// ---- Quotes, invoices, messages and uploads (Wave 4, PR P) ----

/** Quotes the client can see: those sent with an accept link that still works, or already accepted. */
export function portalQuotes(rows: PortalQuoteRow[], now: Date = new Date()): PortalQuote[] {
  const out: PortalQuote[] = []
  for (const q of rows) {
    const accepted = q.links.find((l) => l.accepted_at)
    const live = q.links.find((l) => acceptLinkState(l, now) === 'active')
    if (!accepted && !(live && acceptableStatus(q.status))) continue
    out.push({
      id: q.id,
      reference: q.reference_number,
      date: q.date,
      validUntil: q.valid_until,
      amount: Number(q.amount || 0),
      currency: String(q.quotation_currency || q.currency || 'AED') || 'AED',
      state: accepted ? 'accepted' : 'waiting',
      acceptedBy: accepted?.accepted_name || '',
      acceptedOn: accepted?.accepted_at ? day(accepted.accepted_at) : null,
      hasPdf: (accepted || live)?.has_pdf ?? false,
    })
  }
  return out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}

/** Invoices that have gone out (not drafts or cancelled), newest first, with what is still owed. */
export function portalInvoices(rows: PortalInvoiceRow[], payments: { invoice_ref: string; amount: number }[]): PortalInvoice[] {
  const paidByRef = new Map<string, number>()
  for (const p of payments) {
    const ref = String(p.invoice_ref || '').trim()
    if (ref) paidByRef.set(ref, (paidByRef.get(ref) ?? 0) + (Number(p.amount) || 0))
  }
  return rows
    .filter((i) => {
      const s = String(i.status || '').toLowerCase()
      return s !== 'draft' && s !== 'cancelled'
    })
    .map((i) => {
      const paid = String(i.payment_status || '').toLowerCase() === 'paid'
      const amount = Number(i.amount || 0)
      const balance = paid ? 0 : round2(Math.max(0, amount - (paidByRef.get(i.reference_number.trim()) ?? 0)))
      const url = String(i.pay_link_url || '').trim()
      return {
        id: i.id,
        reference: i.reference_number,
        date: i.date,
        due: invoiceDueDate(i),
        amount,
        currency: String(i.currency || 'AED') || 'AED',
        balance,
        paid: paid || balance <= 0,
        payUrl: !paid && balance > 0 && /^https:\/\//.test(url) ? url : null,
      }
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 50)
}

export const PORTAL_MESSAGE_MAX = 4000

/** Why a ticket message from the portal cannot be sent, or null. */
export function portalMessageProblem(message: string): string | null {
  const m = message.trim()
  if (!m) return 'Write your message first.'
  if (m.length > PORTAL_MESSAGE_MAX) return `Keep the message under ${PORTAL_MESSAGE_MAX} characters.`
  return null
}

/** 5 MB: files travel as base64 inside one request. */
export const PORTAL_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
export const PORTAL_UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  csv: 'text/csv',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/** A file name that is safe to store: no folders, no odd characters, 120 characters at most. */
export function safeUploadName(name: string): string {
  const base = String(name || '').split(/[\\/]/).pop() || ''
  const cleaned = base.replace(/[^A-Za-z0-9 ._()-]+/g, '_').replace(/\s+/g, ' ').replace(/^[ .]+/, '').trim()
  return (cleaned || 'file').slice(-120)
}

/** The content type for an allowed file, from its extension, or null when the type is not allowed. */
export function uploadContentType(name: string): string | null {
  const ext = (String(name).split('.').pop() || '').toLowerCase()
  return PORTAL_UPLOAD_TYPES[ext] ?? null
}

/** Why an upload is refused, or null. `size` is the file size in bytes. */
export function portalUploadProblem(input: { filename: string; size: number }): string | null {
  if (!input.filename.trim()) return 'Pick a file.'
  if (!uploadContentType(input.filename)) return 'That type of file cannot be uploaded. Use PDF, an image, Word, Excel, PowerPoint, CSV or text.'
  if (!(input.size > 0)) return 'The file is empty.'
  if (input.size > PORTAL_UPLOAD_MAX_BYTES) return 'The file is over 5 MB. Send a smaller one, or share a link in a ticket message.'
  return null
}

/** Bytes in a base64 string, without decoding it. */
export function base64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, '')
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((clean.length * 3) / 4) - pad)
}

export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** The WorkDrive folder id inside a folder link (or a bare id). Same rules as zohoWorkDrive.ts. */
export function workDriveFolderId(url: string): string | null {
  const u = String(url || '').trim()
  if (!u) return null
  for (const re of [/\/folders?\/([a-zA-Z0-9_-]+)/i, /[?&]id=([a-zA-Z0-9_-]+)/i]) {
    const m = u.match(re)
    if (m?.[1] && m[1].length >= 8) return m[1]
  }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(u) && !u.includes('://')) return u
  return null
}

// For the Edge Function, which reads the rates from app_settings.
export { DELIVERY_RATE_KEYS, ratesFromSettings } from './delivery'
export { acceptProblem } from './quoteAccept'
