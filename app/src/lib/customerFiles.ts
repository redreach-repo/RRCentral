import { db } from './db'
import { isMissingRelationError } from './errors'
import type {
  CrmEntry,
  CustomerDocument,
  CustomerDocumentCategory,
  DeliveryNote,
  Invoice,
  Quotation,
} from './types'

export const CUSTOMER_DOCUMENT_CATEGORIES: {
  id: CustomerDocumentCategory
  label: string
  hint: string
}[] = [
  { id: 'quotation', label: 'Quotations', hint: 'Quote PDFs on WorkDrive' },
  { id: 'invoice', label: 'Invoices', hint: 'Tax invoice PDFs' },
  { id: 'delivery_note', label: 'Delivery notes', hint: 'Signed or issued DN copies' },
  { id: 'payment_slip', label: 'Payment slips', hint: 'Bank transfers, remittance advice' },
  { id: 'other', label: 'Other', hint: 'Contracts, specs, misc' },
]

export const WORKDRIVE_STORAGE_PROVIDER = 'zoho_workdrive'

export type FolderItemKind = 'crm' | 'workdrive'

export type CustomerFolderItem = {
  key: string
  kind: FolderItemKind
  category: CustomerDocumentCategory
  title: string
  subtitle?: string
  date?: string | null
  status?: string
  /** In-app document route when kind is crm */
  href?: string
  /** Zoho WorkDrive (or other) share URL when kind is workdrive */
  driveUrl?: string
  documentId?: string
  relatedRef?: string
}

export type CustomerFolder = {
  company: string
  crm: CrmEntry | null
  items: CustomerFolderItem[]
  byCategory: Record<CustomerDocumentCategory, CustomerFolderItem[]>
  missingDocumentsTable?: boolean
}

/** Accept Zoho WorkDrive share / folder links (incl. regional + external hosts). */
export function isWorkDriveShareUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (!u) return false
  return (
    u.includes('workdrive.zoho') ||
    u.includes('workdrive.zohoexternal.com') ||
    /https?:\/\/[^/]*zoho[^/]*\/workdrive\//.test(u)
  )
}

/** @deprecated Prefer isWorkDriveShareUrl — kept for older call sites. */
export function isDriveShareUrl(url: string): boolean {
  return isWorkDriveShareUrl(url)
}

export function suggestedDriveFolderName(company: string): string {
  return String(company || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Build a customer folder from live CRM docs + WorkDrive-linked uploads. */
export function buildCustomerFolder(opts: {
  company: string
  crm: CrmEntry | null
  quotations: Quotation[]
  invoices: Invoice[]
  deliveryNotes: DeliveryNote[]
  documents: CustomerDocument[]
}): CustomerFolder {
  const company = opts.company.trim()
  const items: CustomerFolderItem[] = []

  for (const q of opts.quotations) {
    const ref = q.reference_number || q.quote_id || q.id
    items.push({
      key: `quote-${q.id}`,
      kind: 'crm',
      category: 'quotation',
      title: ref,
      subtitle: q.description || undefined,
      date: q.date,
      status: q.status,
      href: `/document/quote/${q.id}`,
      relatedRef: ref,
    })
  }

  for (const inv of opts.invoices) {
    const ref = inv.reference_number || inv.id
    items.push({
      key: `invoice-${inv.id}`,
      kind: 'crm',
      category: 'invoice',
      title: ref,
      subtitle: inv.description || undefined,
      date: inv.date,
      status: inv.status,
      href: `/document/invoice/${inv.id}`,
      relatedRef: ref,
    })
  }

  for (const dn of opts.deliveryNotes) {
    const ref = dn.reference_number || dn.id
    items.push({
      key: `dn-${dn.id}`,
      kind: 'crm',
      category: 'delivery_note',
      title: ref,
      subtitle: dn.quote_ref ? `Quote ${dn.quote_ref}` : dn.description || undefined,
      date: dn.delivery_date || dn.date,
      status: dn.status,
      href: `/document/delivery-note/${dn.id}`,
      relatedRef: ref,
    })
  }

  for (const doc of opts.documents) {
    items.push({
      key: `doc-${doc.id}`,
      kind: 'workdrive',
      category: doc.category,
      title: doc.title || doc.file_name || 'WorkDrive file',
      subtitle: doc.notes || undefined,
      date: doc.uploaded_at,
      driveUrl: doc.drive_url,
      documentId: doc.id,
      relatedRef: doc.related_ref || undefined,
    })
  }

  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const byCategory = Object.fromEntries(
    CUSTOMER_DOCUMENT_CATEGORIES.map((c) => [c.id, [] as CustomerFolderItem[]]),
  ) as Record<CustomerDocumentCategory, CustomerFolderItem[]>

  for (const item of items) {
    byCategory[item.category].push(item)
  }

  return { company, crm: opts.crm, items, byCategory }
}

export async function loadCustomerDocuments(company: string): Promise<CustomerDocument[]> {
  const name = company.trim()
  if (!name) return []
  const { data, error } = await db
    .from('customer_documents')
    .select('*')
    .ilike('company_name', name)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data || []) as CustomerDocument[]
}

export async function loadCustomerFolder(company: string): Promise<CustomerFolder> {
  const name = company.trim()
  if (!name) {
    return buildCustomerFolder({
      company: '',
      crm: null,
      quotations: [],
      invoices: [],
      deliveryNotes: [],
      documents: [],
    })
  }

  const [crmRes, qRes, iRes, dnRes, docsResult] = await Promise.all([
    db.from('crm').select('*').ilike('company_name', name).limit(1).maybeSingle(),
    db.from('quotations').select('*').ilike('client', name).order('created_at', { ascending: false }),
    db.from('invoices').select('*').ilike('client', name).order('created_at', { ascending: false }),
    db
      .from('delivery_notes')
      .select('*')
      .ilike('client', name)
      .order('created_at', { ascending: false }),
    loadCustomerDocuments(name).then(
      (documents) => ({ documents, missing: false as const }),
      (err: unknown) => {
        if (isMissingRelationError(err)) return { documents: [] as CustomerDocument[], missing: true as const }
        throw err
      },
    ),
  ])

  if (crmRes.error) throw crmRes.error
  if (qRes.error) throw qRes.error
  if (iRes.error) throw iRes.error
  if (dnRes.error) throw dnRes.error

  const folder = buildCustomerFolder({
    company: name,
    crm: (crmRes.data as CrmEntry) || null,
    quotations: (qRes.data || []) as Quotation[],
    invoices: (iRes.data || []) as Invoice[],
    deliveryNotes: (dnRes.data || []) as DeliveryNote[],
    documents: docsResult.documents,
  })

  return { ...folder, missingDocumentsTable: docsResult.missing }
}

export async function saveCustomerDriveLink(opts: {
  company: string
  crmId?: string | null
  category: CustomerDocumentCategory
  title: string
  driveUrl: string
  relatedRef?: string
  notes?: string
  uploadedBy: string
}): Promise<CustomerDocument> {
  const company = opts.company.trim()
  const driveUrl = opts.driveUrl.trim()
  const title = opts.title.trim()
  if (!company) throw new Error('Company is required')
  if (!driveUrl) throw new Error('Paste a Zoho WorkDrive share link')
  if (!title) throw new Error('Give the file a short title')

  const row = {
    company_name: company,
    crm_id: opts.crmId || null,
    category: opts.category,
    title,
    file_name: title,
    drive_url: driveUrl,
    related_ref: (opts.relatedRef || '').trim(),
    notes: (opts.notes || '').trim(),
    storage_provider: WORKDRIVE_STORAGE_PROVIDER,
    uploaded_by: opts.uploadedBy,
    uploaded_at: new Date().toISOString(),
  }

  const { data, error } = await db.from('customer_documents').insert(row).select('*').maybeSingle()
  if (error) throw error
  if (data) return data as CustomerDocument

  // Local DB may not return the row from insert+select — reload.
  const docs = await loadCustomerDocuments(company)
  const match = docs.find(
    (d) => d.drive_url === driveUrl && d.title === title && d.category === opts.category,
  )
  if (!match) throw new Error('Saved, but could not reload the document')
  return match
}

export async function deleteCustomerDocument(id: string): Promise<void> {
  const { error } = await db.from('customer_documents').delete().eq('id', id)
  if (error) throw error
}

export async function updateCrmDriveFolderUrl(crmId: string, driveFolderUrl: string): Promise<void> {
  const { error } = await db
    .from('crm')
    .update({
      drive_folder_url: driveFolderUrl.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', crmId)
  if (error) throw error
}
