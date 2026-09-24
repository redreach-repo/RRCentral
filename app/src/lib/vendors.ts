import { db } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import type { Vendor } from './types'

export type VendorInput = {
  company_name: string
  primary_contact?: string
  email?: string
  mobile?: string
  office?: string
  address?: string
  trn?: string
  website?: string
  payment_terms?: string
  notes?: string
  active?: boolean
}

export async function listVendors(): Promise<Vendor[]> {
  const { data, error } = await db.from('vendors').select('*').order('company_name')
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return ((data || []) as Vendor[]).filter((v) => v.active !== false)
}

export async function findVendorByName(companyName: string): Promise<Vendor | null> {
  const name = companyName.trim()
  if (!name) return null
  const all = await listVendors()
  const lower = name.toLowerCase()
  return all.find((v) => v.company_name.trim().toLowerCase() === lower) || null
}

/** Create or update a vendor by company name (used when saving a supplier invoice). */
export async function ensureVendor(input: VendorInput): Promise<Vendor | null> {
  const company_name = String(input.company_name || '').trim()
  if (!company_name) return null

  const existing = await findVendorByName(company_name)
  const now = new Date().toISOString()
  const patch = {
    company_name,
    primary_contact: String(input.primary_contact || existing?.primary_contact || '').trim(),
    email: String(input.email || existing?.email || '').trim(),
    mobile: String(input.mobile || existing?.mobile || '').trim(),
    office: String(input.office || existing?.office || '').trim(),
    address: String(input.address || existing?.address || '').trim(),
    trn: String(input.trn || existing?.trn || '').trim(),
    website: String(input.website || existing?.website || '').trim(),
    payment_terms: String(input.payment_terms || existing?.payment_terms || '').trim(),
    notes: String(input.notes || existing?.notes || '').trim(),
    active: input.active !== false,
    updated_at: now,
  }

  if (existing) {
    // Only fill empty fields from the invoice; never wipe known data with blanks from a partial parse.
    const merged = {
      ...patch,
      primary_contact: patch.primary_contact || existing.primary_contact,
      email: patch.email || existing.email,
      mobile: patch.mobile || existing.mobile,
      office: patch.office || existing.office,
      address: patch.address || existing.address,
      trn: patch.trn || existing.trn,
      website: patch.website || existing.website,
      payment_terms: patch.payment_terms || existing.payment_terms,
      notes: existing.notes || patch.notes,
    }
    const { error } = await db.from('vendors').update(merged).eq('id', existing.id)
    if (error) {
      if (isMissingRelationError(error) || isUndefinedColumnError(error)) return existing
      throw error
    }
    return { ...existing, ...merged }
  }

  const id = crypto.randomUUID()
  const row = { ...patch, id, created_at: now }
  const { error } = await db.from('vendors').insert(row)
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return null
    throw error
  }
  return row as Vendor
}
