import { db } from './db'
import { isMissingRelationError } from './errors'
import type { OwnedDomain, OwnedDomainBillingCycle, OwnedDomainStatus } from './types'

export const DOMAIN_STATUSES: OwnedDomainStatus[] = [
  'active',
  'pending',
  'expired',
  'transferred',
  'parked',
]

export const DOMAIN_BILLING_CYCLES: { value: OwnedDomainBillingCycle; label: string }[] = [
  { value: '', label: '—' },
  { value: 'annual', label: 'Annual' },
  { value: 'biennial', label: 'Biennial' },
  { value: 'other', label: 'Other' },
]

export type OwnedDomainInput = {
  domain_name: string
  registrar?: string
  registrar_account?: string
  status?: OwnedDomainStatus
  registered_on?: string | null
  expires_on?: string | null
  auto_renew?: boolean
  dns_provider?: string
  nameservers?: string
  hosting_provider?: string
  website_url?: string
  managed_by?: string
  cost_aed?: number | null
  billing_cycle?: OwnedDomainBillingCycle
  notes?: string
  active?: boolean
}

/** Normalize for storage / uniqueness (lowercase, strip protocol/path/www). */
export function normalizeDomainName(raw: string): string {
  let s = String(raw || '')
    .trim()
    .toLowerCase()
  s = s.replace(/^https?:\/\//i, '')
  s = (s.split('/')[0] || '').replace(/:\d+$/, '')
  s = s.replace(/\.+$/g, '')
  if (s.startsWith('www.')) s = s.slice(4)
  return s
}

export function domainStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'pending':
      return 'Pending'
    case 'expired':
      return 'Expired'
    case 'transferred':
      return 'Transferred'
    case 'parked':
      return 'Parked'
    default:
      return status || '—'
  }
}

export async function listOwnedDomains(opts?: {
  includeInactive?: boolean
}): Promise<OwnedDomain[]> {
  const { data, error } = await db.from('owned_domains').select('*').order('domain_name')
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  const rows = (data || []) as OwnedDomain[]
  return opts?.includeInactive ? rows : rows.filter((d) => d.active !== false)
}

export async function listOwnedDomainsResult(opts?: {
  includeInactive?: boolean
}): Promise<{
  rows: OwnedDomain[]
  missingTable: boolean
}> {
  const { data, error } = await db.from('owned_domains').select('*').order('domain_name')
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  const rows = (data || []) as OwnedDomain[]
  return {
    rows: opts?.includeInactive ? rows : rows.filter((d) => d.active !== false),
    missingTable: false,
  }
}

export async function restoreOwnedDomain(id: string): Promise<void> {
  const { error } = await db
    .from('owned_domains')
    .update({ active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

