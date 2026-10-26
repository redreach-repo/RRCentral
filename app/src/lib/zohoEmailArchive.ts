/**
 * Scan Zoho Mail inbox + sent, match CRM contacts, file emails into the
 * client's Google Drive folder, and link them on the customer folder (Communications).
 */

import { db } from './db'
import type { CrmEntry, CustomerDocument } from './types'
import { hydrateContacts } from './contacts'
import {
  getZohoMessageHtml,
  listZohoInboxMessages,
  listZohoSentMessages,
  type ZohoInboxMessage,
  type ZohoSettings,
} from './zoho'
import { attachCrmMatches, type InboxRow } from './zohoInboxMatch'
import { DRIVE_STORAGE_PROVIDER, uploadToClientDrive } from './googleDrive'
import { loadCustomerDocuments, saveCustomerDriveLink } from './customerFiles'
import { logActivity } from './activity'
import { isMissingRelationError, errorMessage } from './errors'

export const ZOHO_MSG_REF_PREFIX = 'zoho-msg:'

export function zohoMessageRelatedRef(messageId: string): string {
  return `${ZOHO_MSG_REF_PREFIX}${messageId}`
}

export function isZohoMessageAlreadyFiled(
  docs: CustomerDocument[],
  messageId: string,
): boolean {
  const ref = zohoMessageRelatedRef(messageId)
  return docs.some(
    (d) =>
      d.related_ref === ref ||
      d.notes.includes(ref) ||
      d.title.includes(messageId),
  )
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'email'
}

function buildEmailHtmlArchive(opts: {
  subject: string
  from: string
  to: string
  when: string
  mailbox: 'inbox' | 'sent'
  bodyHtml: string
  matchedEmail: string
  company: string
}): string {
  const body = opts.bodyHtml || '<p><em>(no body)</em></p>'
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.subject)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 24px auto; color: #111; }
  .meta { background: #f4f4f5; padding: 12px 14px; border-radius: 8px; font-size: 13px; line-height: 1.5; }
  .meta strong { display: inline-block; min-width: 72px; color: #555; }
  .body { margin-top: 20px; font-size: 14px; line-height: 1.55; }
</style>
</head>
<body>
  <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(opts.subject)}</h1>
  <div class="meta">
    <div><strong>Mailbox</strong> ${escapeHtml(opts.mailbox)}</div>
    <div><strong>From</strong> ${escapeHtml(opts.from)}</div>
    <div><strong>To</strong> ${escapeHtml(opts.to)}</div>
    <div><strong>When</strong> ${escapeHtml(opts.when)}</div>
    <div><strong>CRM</strong> ${escapeHtml(opts.company)} (${escapeHtml(opts.matchedEmail)})</div>
  </div>
  <div class="body">${body}</div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type FileEmailResult = {
  messageId: string
  company: string
  status: 'filed' | 'skipped' | 'error'
  detail: string
  driveUrl?: string
}

export type ScanAndFileSummary = {
  scanned: number
  matched: number
  filed: number
  skipped: number
  errors: number
  results: FileEmailResult[]
}

async function loadCrmById(id: string): Promise<CrmEntry | null> {
  const { data, error } = await db.from('crm').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as CrmEntry) || null
}

async function fileOneMatchedEmail(opts: {
  settings: ZohoSettings
  row: InboxRow
  mailbox: 'inbox' | 'sent'
  uploadedBy: string
  existingDocsByCompany: Map<string, CustomerDocument[]>
}): Promise<FileEmailResult> {
  const { settings, row, mailbox, uploadedBy } = opts
  if (!row.crm) {
    return { messageId: row.messageId, company: '', status: 'skipped', detail: 'No CRM match' }
  }

  const company = row.crm.companyName
  let docs = opts.existingDocsByCompany.get(company)
  if (!docs) {
    docs = await loadCustomerDocuments(company).catch(() => [] as CustomerDocument[])
    opts.existingDocsByCompany.set(company, docs)
  }

  if (isZohoMessageAlreadyFiled(docs, row.messageId)) {
    return {
      messageId: row.messageId,
      company,
      status: 'skipped',
      detail: 'Already filed',
    }
  }

  try {
    const entry = await loadCrmById(row.crm.crmId)
    if (!entry) {
      return {
        messageId: row.messageId,
        company,
        status: 'error',
        detail: 'CRM company missing',
      }
    }

    let bodyHtml = ''
    try {
      bodyHtml = await getZohoMessageHtml(settings, {
        folderId: row.folderId,
        messageId: row.messageId,
      })
    } catch {
      bodyHtml = `<p>${escapeHtml(row.summary || '(body unavailable — check ZohoMail.messages.READ)')}</p>`
    }

    const when = row.receivedTime
      ? new Date(row.receivedTime).toISOString()
      : new Date().toISOString()
    const html = buildEmailHtmlArchive({
      subject: row.subject,
      from: row.fromAddress || row.sender,
      to: row.toAddress || '',
      when,
      mailbox,
      bodyHtml,
      matchedEmail: row.crm.matchedEmail,
      company,
    })

    const filename = `${sanitizeFilename(row.subject || 'email')}-${row.messageId.slice(-8)}.html`
    // Makes the client's folder under RR Central / Customers on first use.
    const uploaded = await uploadToClientDrive({
      crmId: entry.id,
      filename,
      content: html,
      contentType: 'text/html;charset=utf-8',
    })
    const driveUrl = uploaded.url

    const title =
      mailbox === 'sent'
        ? `Email sent – ${row.subject}`
        : `Email received – ${row.subject}`

    await saveCustomerDriveLink({
      company,
      crmId: entry.id,
      category: 'email',
      title: title.slice(0, 180),
      driveUrl,
      relatedRef: zohoMessageRelatedRef(row.messageId),
      notes: `${mailbox} · ${row.crm.matchedEmail} · ${ZOHO_MSG_REF_PREFIX}${row.messageId}`,
      uploadedBy,
    })

    await logActivity(
      'file_zoho_email_drive',
      'customer_document',
      company,
      `${mailbox}: ${row.subject}`,
      uploadedBy,
      entry.id,
    )

    docs.push({
      id: `temp-${row.messageId}`,
      company_name: company,
      crm_id: entry.id,
      category: 'email',
      title,
      file_name: filename,
      drive_url: driveUrl,
      related_ref: zohoMessageRelatedRef(row.messageId),
      notes: '',
      storage_provider: DRIVE_STORAGE_PROVIDER,
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString(),
    })

    return {
      messageId: row.messageId,
      company,
      status: 'filed',
      detail: title,
      driveUrl,
    }
  } catch (e) {
    return {
      messageId: row.messageId,
      company,
      status: 'error',
      detail: errorMessage(e, 'File failed'),
    }
  }
}

/**
 * Scan inbox + sent, match CRM contact emails, upload HTML copies into each
 * client's Google Drive folder (made as needed), and link under Communications.
 */
export async function scanAndFileCrmEmails(opts: {
  settings: ZohoSettings
  driveConnected: boolean
  crmEntries: CrmEntry[]
  uploadedBy: string
  limitPerFolder?: number
}): Promise<ScanAndFileSummary> {
  if (!opts.driveConnected) {
    throw new Error('Connect Google Drive in Settings first (an admin does this once)')
  }

  const limit = Math.min(Math.max(opts.limitPerFolder || 25, 1), 40)
  const [inbox, sent] = await Promise.all([
    listZohoInboxMessages(opts.settings, { limit, status: 'all' }),
    listZohoSentMessages(opts.settings, { limit }),
  ])

  const tagged: { row: InboxRow; mailbox: 'inbox' | 'sent' }[] = [
    ...attachCrmMatches(inbox, opts.crmEntries).map((row) => ({ row, mailbox: 'inbox' as const })),
    ...attachCrmMatches(sent, opts.crmEntries).map((row) => ({ row, mailbox: 'sent' as const })),
  ]

  const matched = tagged.filter((t) => t.row.crm)
  const existingDocsByCompany = new Map<string, CustomerDocument[]>()
  const results: FileEmailResult[] = []

  for (const item of matched) {
    const result = await fileOneMatchedEmail({
      settings: opts.settings,
      row: item.row,
      mailbox: item.mailbox,
      uploadedBy: opts.uploadedBy,
      existingDocsByCompany,
    })
    results.push(result)
  }

  const filed = results.filter((r) => r.status === 'filed').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const errors = results.filter((r) => r.status === 'error').length

  return {
    scanned: tagged.length,
    matched: matched.length,
    filed,
    skipped,
    errors,
    results,
  }
}

/** Preview helpers for UI without filing. */
export function countCrmMatchedMessages(
  inbox: ZohoInboxMessage[],
  sent: ZohoInboxMessage[],
  crmEntries: CrmEntry[],
): { total: number; matched: number } {
  const rows = [
    ...attachCrmMatches(inbox, crmEntries),
    ...attachCrmMatches(sent, crmEntries),
  ]
  return {
    total: rows.length,
    matched: rows.filter((r) => r.crm).length,
  }
}

export function crmHasAnyContactEmail(entries: CrmEntry[]): boolean {
  for (const e of entries) {
    for (const c of hydrateContacts(e)) {
      if (c.email?.includes('@')) return true
    }
    if (e.email_phone?.includes('@')) return true
  }
  return false
}

export function archiveSetupHint(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (isMissingRelationError(err)) {
    return 'Run supabase/migrations/20260924224316_customer_files.sql so customer_documents exists.'
  }
  return msg
}
