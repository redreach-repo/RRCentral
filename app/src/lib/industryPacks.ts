/** Industry pack catalog helpers (M12). */

import { withModuleFlag } from '../modules/registry'

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

/** Map pack manifest module ids → Settings moduleFlags keys. */
export const PACK_MODULE_TO_FLAG: Record<string, string> = {
  sales: 'sales',
  finance: 'finance',
  clients: 'clients',
  delivery: 'delivery',
  ops: 'ops',
  hr: 'hr',
  payroll: 'payroll',
  marketing: 'marketing',
  overview: 'overview',
  saasBilling: 'saasBilling',
  industryPacks: 'industryPacks',
}

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
  {
    pack_key: 'logistics',
    name: 'Logistics',
    description: 'Lanes, carriers, and delivery windows (starter templates).',
    version: '0.1.0',
    manifest: { modules: ['sales', 'ops', 'delivery'], objects: ['deal', 'product'] },
  },
  {
    pack_key: 'engineering',
    name: 'Engineering',
    description: 'Master Spec §11.3 starter: projects, claims, document registers (full pack later).',
    version: '0.1.0',
    manifest: { modules: ['sales', 'delivery', 'ops', 'finance'], objects: ['deal', 'project'] },
  },
  {
    pack_key: 'construction',
    name: 'Construction',
    description: 'Master Spec §11.4 starter: sites, workforce, materials (full pack later).',
    version: '0.1.0',
    manifest: { modules: ['sales', 'delivery', 'ops', 'finance', 'hr'], objects: ['deal', 'project'] },
  },
]

export function packModuleHints(pack: IndustryPack): string {
  const mods = pack.manifest.modules || []
  return mods.length ? mods.join(', ') : 'general'
}

/** Module flag keys a pack wants enabled (unknown modules skipped). */
export function moduleFlagsForPack(pack: Pick<IndustryPack, 'manifest'>): string[] {
  const mods = pack.manifest?.modules || []
  const out: string[] = []
  for (const m of mods) {
    const flag = PACK_MODULE_TO_FLAG[m] || PACK_MODULE_TO_FLAG[String(m).toLowerCase()]
    if (flag && !out.includes(flag)) out.push(flag)
  }
  return out
}

/**
 * Enable pack modules in a flags map (false = hidden). Enabling deletes the
 * false entry so the module shows in the shell again.
 */
export function applyPackFlagsToMap(
  flags: Record<string, boolean>,
  pack: Pick<IndustryPack, 'manifest'>,
): { flags: Record<string, boolean>; enabled: string[] } {
  const enabled = moduleFlagsForPack(pack)
  let next = { ...flags }
  for (const flag of enabled) {
    next = withModuleFlag(next, flag, true)
  }
  return { flags: next, enabled }
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
