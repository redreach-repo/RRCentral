/** Industry pack catalog helpers (M12). */

export type IndustryPackManifest = {
  modules?: string[]
  locale?: string
  objects?: string[]
}

export type IndustryPack = {
  pack_key: string
  name: string
  description: string
  version: string
  manifest: IndustryPackManifest
}

export type TenantPackStatus = 'available' | 'active' | 'retired'

export const BUILTIN_INDUSTRY_PACKS: IndustryPack[] = [
  {
    pack_key: 'uae_services',
    name: 'UAE services',
    description: 'Starter pack: VAT-aware quoting labels and follow-up views.',
    version: '0.1.0',
    manifest: { modules: ['sales', 'finance'], locale: 'en' },
  },
  {
    pack_key: 'church_saas',
    name: 'Church SaaS',
    description: 'WorshipHub-oriented account fields and delivery checklists.',
    version: '0.1.0',
    manifest: { modules: ['clients', 'delivery'], objects: ['account'] },
  },
  {
    pack_key: 'trading_import',
    name: 'Trading / import',
    description: 'SKU-heavy quoting labels and supplier commitment hints.',
    version: '0.1.0',
    manifest: { modules: ['sales', 'ops', 'finance'], objects: ['product', 'inventory'] },
  },
  {
    pack_key: 'events_tours',
    name: 'Events & tours',
    description: 'Wanders-style itinerary and booking money fields.',
    version: '0.1.0',
    manifest: { modules: ['sales', 'delivery'], objects: ['deal'] },
  },
]

export function packModuleHints(pack: IndustryPack): string {
  const mods = pack.manifest.modules || []
  return mods.length ? mods.join(', ') : 'general'
}

export function nextTenantPackStatus(
  current: TenantPackStatus,
  action: 'activate' | 'retire' | 'reset',
): TenantPackStatus | null {
  if (action === 'activate') {
    if (current === 'retired') return null
    return 'active'
  }
  if (action === 'retire') {
    if (current === 'retired') return null
    return 'retired'
  }
  if (action === 'reset') return 'available'
  return null
}
