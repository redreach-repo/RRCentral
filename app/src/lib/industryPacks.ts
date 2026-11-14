/** Industry pack catalog helpers (M12 first slice). */

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
]

export function packModuleHints(pack: IndustryPack): string {
  const mods = pack.manifest.modules || []
  return mods.length ? mods.join(', ') : 'general'
}
