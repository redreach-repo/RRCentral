/** M11: workspace setup / provision helpers. */

export type BusinessTypePack = {
  business_type: string
  pack_key: string
  label: string
  description: string
}

export const BUILTIN_BUSINESS_TYPE_PACKS: BusinessTypePack[] = [
  { business_type: 'services', pack_key: 'uae_services', label: 'Professional services', description: 'VAT-aware quoting starter' },
  { business_type: 'church_saas', pack_key: 'church_saas', label: 'Church / worship SaaS', description: 'WorshipHub-oriented delivery' },
  { business_type: 'trading', pack_key: 'trading_import', label: 'Trading / import', description: 'SKU and supplier hints' },
  { business_type: 'events', pack_key: 'events_tours', label: 'Events & tours', description: 'Itinerary-oriented sales' },
  { business_type: 'engineering', pack_key: 'engineering', label: 'Engineering', description: 'Projects and document registers' },
  { business_type: 'construction', pack_key: 'construction', label: 'Construction', description: 'Sites, workforce, materials' },
]

export function packKeyForBusinessType(
  businessType: string,
  catalog: BusinessTypePack[] = BUILTIN_BUSINESS_TYPE_PACKS,
): string | null {
  const row = catalog.find((r) => r.business_type === businessType)
  return row?.pack_key || null
}

export function workspaceNameProblem(name: string): string | null {
  const n = String(name || '').trim()
  if (!n) return 'workspace_name_required'
  if (n.length < 2) return 'workspace_name_too_short'
  if (n.length > 80) return 'workspace_name_too_long'
  return null
}

export function adminEmailProblem(email: string): string | null {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return 'admin_email_required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'admin_email_invalid'
  return null
}

export function buildIdempotencyKey(input: {
  workspaceName: string
  adminEmail: string
  businessType: string
}): string {
  const base = `${input.businessType}|${input.adminEmail.trim().toLowerCase()}|${input.workspaceName.trim().toLowerCase()}`
  // Stable non-crypto hash for client preview; Edge also stores the raw key.
  let h = 0
  for (let i = 0; i < base.length; i++) h = (Math.imul(31, h) + base.charCodeAt(i)) | 0
  return `ws_${Math.abs(h).toString(36)}_${base.length}`
}

export function provisionRequestProblem(input: {
  workspaceName: string
  adminEmail: string
  businessType: string
}): string | null {
  return (
    workspaceNameProblem(input.workspaceName) ||
    adminEmailProblem(input.adminEmail) ||
    (packKeyForBusinessType(input.businessType) ? null : 'business_type_unknown')
  )
}
