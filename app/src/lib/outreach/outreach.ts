/**
 * Prospect outreach (migration 20261338090000_outreach_pipeline.sql): reading
 * the prospect sheet, statuses and the footer preview. No network here.
 *
 * Dedupe, approval and send rules live in the database; this file only turns
 * the uploaded sheet into rows and labels things for the screens.
 */

export type OutreachStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'ready'
  | 'sending'
  | 'sent'
  | 'replied'
  | 'bounced'
  | 'unsubscribed'
  | 'rejected'
  | 'passed'

export type ImportResult = 'new' | 'needs_enrichment' | 'duplicate' | 'blocked' | 'error'

export type OutreachMessage = {
  id: string
  account_id: string | null
  contact_id: string | null
  deal_id: string | null
  sender_id: string | null
  company: string
  to_name: string
  to_email: string
  subject: string
  body: string
  signal_used: string
  signal_url: string
  country: string
  data_source: string
  checks_note: string
  needs_enrichment: boolean
  status: OutreachStatus
  blocked_reason: string
  approved_by: string | null
  approved_at: string | null
  decided_reason: string
  sent_at: string | null
  last_error: string
  created_at: string
  updated_at: string
}

export type OutreachSettings = {
  id: string
  daily_cap: number
  company_legal_name: string
  company_address: string
  opt_out_text: string
  timezone: string
}

export type OutreachSender = {
  id: string
  user_id: string | null
  email: string
  display_name: string
  signature: string
  active: boolean
}

export type ImportBatch = {
  id: string
  file_name: string
  status: 'staged' | 'imported' | 'cancelled'
  row_count: number
  new_count: number
  enrichment_count: number
  duplicate_count: number
  blocked_count: number
  error_count: number
  created_at: string
}

export type ImportRow = {
  id: string
  row_number: number
  company: string
  contact_name: string
  title: string
  email: string
  country: string
  signal_used: string
  result: ImportResult
  reason: string
}

/** One sheet row as the database import takes it. */
export type SheetRow = {
  company: string
  contact_name: string
  title: string
  email: string
  country: string
  signal_used: string
  signal_url: string
  subject: string
  body: string
  send_from: string
  status: string
  checks: string
}

/** The sheet's columns, in the order Alfred's template has them. */
export const SHEET_COLUMNS: { key: keyof SheetRow; header: string; aliases: string[] }[] = [
  { key: 'company', header: 'Company', aliases: ['company', 'companyname', 'organisation', 'organization', 'account'] },
  { key: 'contact_name', header: 'Contact name', aliases: ['contactname', 'contact', 'name', 'fullname'] },
  { key: 'title', header: 'Title', aliases: ['title', 'jobtitle', 'role', 'position'] },
  { key: 'email', header: 'Email', aliases: ['email', 'emailaddress', 'mail'] },
  { key: 'country', header: 'Country', aliases: ['country'] },
  { key: 'signal_used', header: 'Signal used', aliases: ['signalused', 'signal'] },
  { key: 'signal_url', header: 'Signal source URL', aliases: ['signalsourceurl', 'signalurl', 'sourceurl', 'signalsource'] },
  { key: 'subject', header: 'Subject', aliases: ['subject', 'emailsubject'] },
  { key: 'body', header: 'Body', aliases: ['body', 'emailbody', 'message'] },
  { key: 'send_from', header: 'Send from', aliases: ['sendfrom', 'from', 'sender'] },
  { key: 'status', header: 'Status', aliases: ['status'] },
  { key: 'checks', header: 'Checks before sending', aliases: ['checksbeforesending', 'checks', 'notes'] },
]

export const MAX_IMPORT_ROWS = 2000

function headerKey(h: string): string {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * CSV that keeps line breaks inside quoted cells (email bodies have them).
 * Accepts comma, semicolon or tab, whichever the first line uses most.
 */
export function parseCsvCells(text: string): string[][] {
  const src = String(text || '').replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] || ''
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const)
  const sep = counts.sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
      continue
    }
    if (c === '"' && cell === '') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

export type SheetParse = { rows: SheetRow[]; missing: string[]; ignored: string[]; error: string }

/** Header row plus data rows (from .xlsx or .csv) into import rows. */
export function sheetToRows(cells: string[][]): SheetParse {
  if (!cells.length) return { rows: [], missing: [], ignored: [], error: 'The file is empty.' }
  // The header row is the first row that names a Company and an Email column.
  const headerAt = cells.findIndex((r) => {
    const keys = r.map(headerKey)
    return keys.some((k) => SHEET_COLUMNS[0].aliases.includes(k)) && keys.some((k) => SHEET_COLUMNS[3].aliases.includes(k))
  })
  if (headerAt < 0) return { rows: [], missing: ['Company', 'Email'], ignored: [], error: 'No header row with Company and Email columns was found.' }
  const header = cells[headerAt].map(headerKey)
  const index = new Map<keyof SheetRow, number>()
  const used = new Set<number>()
  for (const col of SHEET_COLUMNS) {
    const at = header.findIndex((h, i) => !used.has(i) && col.aliases.includes(h))
    if (at >= 0) {
      index.set(col.key, at)
      used.add(at)
    }
  }
  const missing = SHEET_COLUMNS.filter((c) => !index.has(c.key)).map((c) => c.header)
  const ignored = cells[headerAt].filter((h, i) => !used.has(i) && String(h).trim()).map(String)
  const rows: SheetRow[] = []
  for (const r of cells.slice(headerAt + 1)) {
    const get = (k: keyof SheetRow) => {
      const i = index.get(k)
      return i == null ? '' : String(r[i] ?? '')
    }
    const row = Object.fromEntries(SHEET_COLUMNS.map((c) => [c.key, c.key === 'body' ? get(c.key).replace(/\r\n?/g, '\n') : get(c.key).trim()])) as SheetRow
    if (Object.values(row).every((v) => !v.trim())) continue
    rows.push(row)
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], missing, ignored, error: `The file has ${rows.length} rows; import at most ${MAX_IMPORT_ROWS} at a time.` }
  }
  return { rows, missing, ignored, error: rows.length ? '' : 'The file has a header row but no prospects.' }
}

/** Blocklist CSV (CompMan or CTRM Next export): any company and domain or email columns. */
export function blocklistRows(cells: string[][]): { company: string; domain: string }[] {
  if (cells.length < 2) return []
  const header = cells[0].map(headerKey)
  const company = header.findIndex((h) => ['company', 'companyname', 'name', 'account', 'organisation', 'organization', 'client'].includes(h))
  const domain = header.findIndex((h) => ['domain', 'website', 'web', 'url', 'emaildomain'].includes(h))
  const email = header.findIndex((h) => ['email', 'emailaddress'].includes(h))
  return cells
    .slice(1)
    .map((r) => ({
      company: company >= 0 ? String(r[company] ?? '').trim() : '',
      domain: String((domain >= 0 ? r[domain] : '') || (email >= 0 ? r[email] : '') || '').trim(),
    }))
    .filter((r) => r.company || r.domain)
}

export const STATUS_LABEL: Record<OutreachStatus, string> = {
  draft: 'Draft',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved, blocked',
  ready: 'Ready to send',
  sending: 'Sending',
  sent: 'Sent',
  replied: 'Replied',
  bounced: 'Bounced',
  unsubscribed: 'Unsubscribed',
  rejected: 'Rejected',
  passed: 'Passed',
}

export type StatusTone = 'neutral' | 'warn' | 'good' | 'bad'

export function statusTone(s: OutreachStatus): StatusTone {
  if (s === 'ready' || s === 'sent' || s === 'replied') return 'good'
  if (s === 'approved' || s === 'sending' || s === 'awaiting_approval') return 'warn'
  if (s === 'bounced' || s === 'unsubscribed' || s === 'rejected') return 'bad'
  return 'neutral'
}

export const RESULT_LABEL: Record<ImportResult, string> = {
  new: 'New',
  needs_enrichment: 'Needs enrichment',
  duplicate: 'Duplicate',
  blocked: 'Blocked',
  error: 'Problem',
}

/** The review list's filters. "To review" is what needs a person. */
export const REVIEW_FILTERS = ['to_review', 'ready', 'sent', 'closed', 'all'] as const
export type ReviewFilter = (typeof REVIEW_FILTERS)[number]

export const REVIEW_FILTER_LABEL: Record<ReviewFilter, string> = {
  to_review: 'To review',
  ready: 'Approved',
  sent: 'Sent',
  closed: 'Rejected or passed',
  all: 'All',
}

export function filterStatuses(f: ReviewFilter): OutreachStatus[] | null {
  switch (f) {
    case 'to_review':
      return ['draft', 'awaiting_approval']
    case 'ready':
      return ['approved', 'ready', 'sending']
    case 'sent':
      return ['sent', 'replied', 'bounced', 'unsubscribed']
    case 'closed':
      return ['rejected', 'passed']
    default:
      return null
  }
}

/** What the review screen may offer for a message (the database decides again). */
export function allowedActions(m: Pick<OutreachMessage, 'status' | 'approved_by'>, myUserId: string | null) {
  const open = m.status === 'draft' || m.status === 'awaiting_approval'
  const approved = m.status === 'approved' || m.status === 'ready'
  const sent = ['sending', 'sent', 'replied', 'bounced', 'unsubscribed'].includes(m.status)
  return {
    edit: !sent,
    approve: open,
    reject: !sent && m.status !== 'rejected',
    pass: !sent && m.status !== 'passed',
    reopen: m.status === 'rejected' || m.status === 'passed',
    send: m.status === 'ready' && Boolean(myUserId) && m.approved_by === myUserId,
    approvedByOther: approved && Boolean(m.approved_by) && m.approved_by !== myUserId,
  }
}

/** Preview of what is added under the body: signature, company line, opt-out. */
export function footerPreview(
  signature: string,
  s: Pick<OutreachSettings, 'company_legal_name' | 'company_address' | 'opt_out_text'> | null,
): { text: string; missing: string[] } {
  const missing: string[] = []
  if (!signature.trim()) missing.push('sender signature')
  if (!s?.company_legal_name.trim()) missing.push('company legal name')
  if (!s?.company_address.trim()) missing.push('postal address')
  if (!s?.opt_out_text.trim()) missing.push('opt-out line')
  const company = s ? `${s.company_legal_name.trim()}, ${s.company_address.trim().replace(/\s*\n\s*/g, ', ')}` : ''
  const text = [signature.trim(), '', '—', company, `${s?.opt_out_text.trim() || ''} [Unsubscribe link]`].join('\n')
  return { text, missing }
}

/** A link to the signal, only when it is a web address. */
export function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw || '').trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}
