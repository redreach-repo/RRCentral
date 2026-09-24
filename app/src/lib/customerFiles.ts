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

export const COMMUNICATION_KINDS: {
  id: 'email' | 'whatsapp' | 'call_notes' | 'communication'
  label: string
}[] = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp chat' },
  { id: 'call_notes', label: 'Call / meeting notes' },
  { id: 'communication', label: 'Other communication' },
]

export const CUSTOMER_FOLDER_SECTIONS: {
  id: 'quotation' | 'invoice' | 'delivery_note' | 'communication'
  label: string
  hint: string
  uploadButton: string
  uploadTitle: string
  uploadHint: string
  /** Signed-doc sections use a fixed category; communications pick a kind. */
  mode: 'signed' | 'communication'
  signedCategory?: 'signed_quotation' | 'signed_invoice' | 'signed_delivery_note'
}[] = [
  {
    id: 'quotation',
    label: 'Quotations',
    hint: 'CRM quotes + signed quote on WorkDrive',
    mode: 'signed',
    signedCategory: 'signed_quotation',
    uploadButton: 'Add signed quote',
    uploadTitle: 'Signed quotation',
    uploadHint: 'Upload the signed quote PDF to Zoho WorkDrive, then paste the share link.',
  },
  {
    id: 'invoice',
    label: 'Invoices',
    hint: 'CRM invoices + signed invoice on WorkDrive',
    mode: 'signed',
    signedCategory: 'signed_invoice',
    uploadButton: 'Add signed invoice',
    uploadTitle: 'Signed invoice',
    uploadHint: 'Upload the signed invoice PDF to Zoho WorkDrive, then paste the share link.',
  },
  {
    id: 'delivery_note',
    label: 'Delivery notes',
    hint: 'CRM delivery notes + signed DN on WorkDrive',
    mode: 'signed',
    signedCategory: 'signed_delivery_note',
    uploadButton: 'Add signed delivery note',
    uploadTitle: 'Signed delivery note',
    uploadHint: 'Upload the customer-signed DN to Zoho WorkDrive, then paste the share link.',
  },
  {
    id: 'communication',
    label: 'Communications',
    hint: 'Emails, WhatsApp chats, call notes on WorkDrive',
    mode: 'communication',
    uploadButton: 'Add communication',
    uploadTitle: 'Communication',
    uploadHint:
      'Save the email export, WhatsApp chat, or notes PDF in Zoho WorkDrive, then paste the share link here.',
  },
]

/** @deprecated Use CUSTOMER_FOLDER_SECTIONS — kept for older imports. */
export const CUSTOMER_DOCUMENT_CATEGORIES = CUSTOMER_FOLDER_SECTIONS.map((s) => ({
  id: s.id as CustomerDocumentCategory,
  label: s.label,
  hint: s.hint,
}))

export const WORKDRIVE_STORAGE_PROVIDER = 'zoho_workdrive'

export type FolderSectionId = (typeof CUSTOMER_FOLDER_SECTIONS)[number]['id']

export type FolderItemKind = 'crm' | 'workdrive'

export type CustomerFolderItem = {
  key: string
  kind: FolderItemKind
  category: CustomerDocumentCategory
  /** Which folder section this row belongs to. */
  section: FolderSectionId
  title: string
  subtitle?: string
  date?: string | null
  status?: string
  href?: string
  driveUrl?: string
  documentId?: string
  relatedRef?: string
}

export type CustomerFolder = {
  company: string
  crm: CrmEntry | null
  items: CustomerFolderItem[]
  bySection: Record<FolderSectionId, CustomerFolderItem[]>
  /** @deprecated Prefer bySection */
  byCategory: Record<string, CustomerFolderItem[]>
  missingDocumentsTable?: boolean
}

export function communicationKindLabel(category: CustomerDocumentCategory): string {
  return COMMUNICATION_KINDS.find((k) => k.id === category)?.label || 'Communication'
}

/** Map stored categories onto customer-folder sections. */
export function sectionForCategory(category: CustomerDocumentCategory): FolderSectionId | null {
  switch (category) {
    case 'quotation':
    case 'signed_quotation':
      return 'quotation'
    case 'invoice':
    case 'signed_invoice':
      return 'invoice'
    case 'delivery_note':
    case 'signed_delivery_note':
      return 'delivery_note'
    case 'email':
    case 'whatsapp':
    case 'call_notes':
    case 'communication':
      return 'communication'
    default:
      return null
  }
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

/** Normalize company names so CRM ↔ quote/invoice client mismatches still match. */
export function normalizeCompanyKey(name: string): string {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripLegalSuffixes(key: string): string {
  return key
    .replace(/\b(llc|ltd|l l c|fze|fzco|fzc|co|company|trading|group|inc|corp|corporation)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function companiesMatch(a: string, b: string): boolean {
  const na = normalizeCompanyKey(a)
  const nb = normalizeCompanyKey(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const sa = stripLegalSuffixes(na)
  const sb = stripLegalSuffixes(nb)
  if (sa && sb && sa === sb) return true
  if (sa.length >= 5 && sb.length >= 5 && (sa.includes(sb) || sb.includes(sa))) return true
  return false
}

function filterByCompany<T extends { client?: string; company_name?: string }>(
  rows: T[],
  company: string,
): T[] {
  return rows.filter((row) => companiesMatch(String(row.client || row.company_name || ''), company))
}

/** Build a customer folder from live CRM docs + signed WorkDrive uploads. */
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
      section: 'quotation',
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
      section: 'invoice',
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
      section: 'delivery_note',
      title: ref,
      subtitle: dn.quote_ref ? `Quote ${dn.quote_ref}` : dn.description || undefined,
      date: dn.delivery_date || dn.date,
      status: dn.status,
      href: `/document/delivery-note/${dn.id}`,
      relatedRef: ref,
    })
  }

  for (const doc of opts.documents) {
    const section = sectionForCategory(doc.category)
    if (!section) continue // hide payment slips / supplier / other from this folder
    const signed =
      doc.category.startsWith('signed_') || /signed/i.test(doc.title) || /signed/i.test(doc.notes)
    const isComms = section === 'communication'
    items.push({
      key: `doc-${doc.id}`,
      kind: 'workdrive',
      category: doc.category,
      section,
      title: doc.title || doc.file_name || (isComms ? 'Communication' : 'Signed copy'),
      subtitle: isComms
        ? [communicationKindLabel(doc.category), doc.notes].filter(Boolean).join(' · ') || undefined
        : signed
          ? doc.notes || 'Signed copy on WorkDrive'
          : doc.notes || undefined,
      date: doc.uploaded_at,
      driveUrl: doc.drive_url,
      documentId: doc.id,
      relatedRef: doc.related_ref || undefined,
    })
  }

  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const bySection: Record<FolderSectionId, CustomerFolderItem[]> = {
    quotation: [],
    invoice: [],
    delivery_note: [],
    communication: [],
  }
  for (const item of items) {
    bySection[item.section].push(item)
  }

  // Back-compat alias used by older UI snapshots / tests
  const byCategory = {
    quotation: bySection.quotation,
    invoice: bySection.invoice,
    delivery_note: bySection.delivery_note,
    communication: bySection.communication,
  }

  return { company, crm: opts.crm, items, bySection, byCategory }
}

export async function loadCustomerDocuments(company: string): Promise<CustomerDocument[]> {
  const name = company.trim()
  if (!name) return []
  const { data, error } = await db
    .from('customer_documents')
    .select('*')
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return filterByCompany((data || []) as CustomerDocument[], name)
}

async function loadRowsMatchingCompany<T extends { client?: string }>(
  table: 'quotations' | 'invoices' | 'delivery_notes',
  company: string,
): Promise<T[]> {
  const name = company.trim()
  if (!name) return []

  // Prefer exact (case-insensitive), then widen with %…% and filter client-side.
  const exact = await db.from(table).select('*').ilike('client', name).order('created_at', { ascending: false })
  if (exact.error) throw exact.error
  let rows = (exact.data || []) as T[]
  if (rows.length) return rows

  const token = normalizeCompanyKey(name).split(' ').filter((t) => t.length >= 3)[0] || name
  const pattern = `%${token}%`
  const loose = await db.from(table).select('*').ilike('client', pattern).order('created_at', { ascending: false })
  if (loose.error) throw loose.error
  return filterByCompany((loose.data || []) as T[], name)
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

  const emptyDocs = { documents: [] as CustomerDocument[], missing: false as const }

  const [crmRes, quotations, invoices, deliveryNotes, docsResult] = await Promise.all([
    db
      .from('crm')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(async (res: { data: unknown; error: { message: string } | null }) => {
        if (res.error) return res
        const match = ((res.data || []) as CrmEntry[]).find((c) => companiesMatch(c.company_name, name))
        return { data: match || null, error: null as { message: string } | null }
      }),
    loadRowsMatchingCompany<Quotation>('quotations', name).catch((err: unknown) => {
      if (isMissingRelationError(err)) return [] as Quotation[]
      throw err
    }),
    loadRowsMatchingCompany<Invoice>('invoices', name).catch((err: unknown) => {
      if (isMissingRelationError(err)) return [] as Invoice[]
      throw err
    }),
    loadRowsMatchingCompany<DeliveryNote>('delivery_notes', name).catch((err: unknown) => {
      if (isMissingRelationError(err)) return [] as DeliveryNote[]
      throw err
    }),
    loadCustomerDocuments(name)
      .then(
        (documents) => ({ documents, missing: false as const }),
        (err: unknown) => {
          if (isMissingRelationError(err)) return { documents: [] as CustomerDocument[], missing: true as const }
          throw err
        },
      )
      .catch(() => emptyDocs),
  ])

  if (crmRes.error) throw crmRes.error

  const folder = buildCustomerFolder({
    company: name,
    crm: (crmRes.data as CrmEntry) || null,
    quotations,
    invoices,
    deliveryNotes,
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
