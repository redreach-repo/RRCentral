/**
 * When a quotation or invoice names a company, make sure that company exists
 * in Clients + CRM, and (when Drive is connected) has a Google Drive folder.
 */

import { logActivity } from './activity'
import { saveClientBillTo, type BillToDraft, type SaveBillToResult } from './clientBillTo'
import { findClientByCompany } from './clientLookup'
import { newContact, normalizeContacts } from './contacts'
import { db } from './db'
import { defaultNextActionDate } from './dealRules'
import { findCrmByCompany } from './crmSync'
import { ensureClientDriveFolder, getDriveStatus } from './googleDrive'
import { isSupabaseConfigured } from './supabaseConfig'
import type { CrmEntry } from './types'

export type EnsureCompanyOpts = {
  company: string
  address?: string
  trn?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  /** CRM owner label (usually the signed-in person's name). */
  owner?: string
  userEmail?: string
  /** Make the Google Drive folder when Drive is connected (default true). */
  ensureDriveFolder?: boolean
  source?: 'quotation' | 'invoice' | 'delivery_note'
}

export type EnsureCompanyResult = {
  client: SaveBillToResult
  crm: 'created' | 'existing' | 'skipped'
  crmId: string | null
  driveFolder: 'created' | 'existing' | 'skipped' | 'error'
  driveFolderUrl?: string
  detail?: string
}

/**
 * Persist the company named on a document into Clients + CRM, and open its
 * Drive folder when Google Drive is connected.
 */
export async function ensureCompanyFromDocument(opts: EnsureCompanyOpts): Promise<EnsureCompanyResult> {
  const company = (opts.company || '').trim()
  if (!company) {
    return { client: 'unchanged', crm: 'skipped', crmId: null, driveFolder: 'skipped', detail: 'No company name' }
  }

  const billTo: BillToDraft = {
    address: (opts.address || '').trim(),
    trn: (opts.trn || '').trim(),
  }
  const client = await ensureClientRow(company, billTo, opts)

  let existing = await findCrmByCompany(company)
  let crm: EnsureCompanyResult['crm'] = existing ? 'existing' : 'skipped'
  let crmId = existing?.id || null

  if (!existing) {
    existing = await createCrmLead(company, opts)
    crm = 'created'
    crmId = existing.id
  } else {
    await enrichCrmIfEmpty(existing, opts)
  }

  let driveFolder: EnsureCompanyResult['driveFolder'] = 'skipped'
  let driveFolderUrl: string | undefined
  let detail: string | undefined

  if (opts.ensureDriveFolder !== false && crmId && isSupabaseConfigured()) {
    try {
      const status = await getDriveStatus()
      if (status.connected) {
        if (existing?.drive_folder_url?.trim()) {
          driveFolder = 'existing'
          driveFolderUrl = existing.drive_folder_url
        } else {
          const made = await ensureClientDriveFolder(crmId)
          driveFolder = 'created'
          driveFolderUrl = made.url
        }
      }
    } catch (e) {
      driveFolder = 'error'
      detail = e instanceof Error ? e.message : 'Could not make the Google Drive folder'
    }
  }

  return { client, crm, crmId, driveFolder, driveFolderUrl, detail }
}

/** Always create a Clients row for a new company name (address/TRN optional). */
async function ensureClientRow(
  company: string,
  billTo: BillToDraft,
  opts: EnsureCompanyOpts,
): Promise<SaveBillToResult> {
  // Prefer the existing bill-to saver when there is something to patch/create with address.
  const viaBillTo = await saveClientBillTo(company, billTo)
  if (viaBillTo !== 'unchanged') return viaBillTo

  // saveClientBillTo returns unchanged when the name is new but address/TRN are blank —
  // still create the client so the company exists in the system.
  if (await findClientByCompany(company)) return 'unchanged'

  const contact = (opts.contactName || '').trim()
  const email = (opts.contactEmail || '').trim()
  const phone = (opts.contactPhone || '').trim()
  const { error } = await db.from('clients').insert({
    company_name: company,
    primary_contact: contact,
    email,
    mobile: phone,
    address: billTo.address || '',
    trn: billTo.trn || '',
    notes: `Added from a ${opts.source || 'document'}`,
    contacts:
      contact || email || phone
        ? normalizeContacts([newContact({ name: contact || company, email, phone, role: 'Primary' })])
        : [],
  })
  if (error) {
    // Unique race or missing optional columns — try bare insert.
    const retry = await db.from('clients').insert({
      company_name: company,
      notes: `Added from a ${opts.source || 'document'}`,
    })
    if (retry.error) throw retry.error
  }
  return 'created'
}

async function createCrmLead(company: string, opts: EnsureCompanyOpts): Promise<CrmEntry> {
  const contact = (opts.contactName || '').trim()
  const email = (opts.contactEmail || '').trim()
  const phone = (opts.contactPhone || '').trim()
  const contacts =
    contact || email || phone
      ? normalizeContacts([newContact({ name: contact || company, email, phone, role: 'Primary' })])
      : []
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    id,
    company_name: company,
    primary_contact: contact,
    email_phone: email,
    mobile_number: phone,
    address: (opts.address || '').trim(),
    trn: (opts.trn || '').trim(),
    contacts,
    owner: (opts.owner || '').trim(),
    pipeline_stage: 'Lead',
    next_action: 'Follow up on quote',
    follow_up_date: defaultNextActionDate(),
    notes: `Added from a ${opts.source || 'document'}`,
    created_by: opts.userEmail || '',
    updated_by: opts.userEmail || '',
    created_at: now,
    updated_at: now,
    calendar_event_id: '',
  }

  const { error } = await db.from('crm').insert(row)
  if (error) throw error

  await logActivity(
    'create_crm_from_document',
    'crm',
    company,
    `Lead · from ${opts.source || 'document'}`,
    opts.userEmail || '',
    id,
  )

  return { ...(row as unknown as CrmEntry), id }
}

/** Fill blank CRM contact / address fields from the document without overwriting. */
async function enrichCrmIfEmpty(entry: CrmEntry, opts: EnsureCompanyOpts): Promise<void> {
  const patch: Record<string, unknown> = {}
  const contact = (opts.contactName || '').trim()
  const email = (opts.contactEmail || '').trim()
  const phone = (opts.contactPhone || '').trim()
  const address = (opts.address || '').trim()
  const trn = (opts.trn || '').trim()

  if (contact && !String(entry.primary_contact || '').trim()) patch.primary_contact = contact
  if (email && !String(entry.email_phone || '').trim()) patch.email_phone = email
  if (phone && !String(entry.mobile_number || '').trim()) patch.mobile_number = phone
  if (address && !String(entry.address || '').trim()) patch.address = address
  if (trn && !String(entry.trn || '').trim()) patch.trn = trn

  if (!Object.keys(patch).length) return
  patch.updated_at = new Date().toISOString()
  if (opts.userEmail) patch.updated_by = opts.userEmail
  await db.from('crm').update(patch).eq('id', entry.id)
}
