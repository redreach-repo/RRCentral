/**
 * Tenant app identity for installable web apps (Master Spec §5.6).
 * Derives a per-tenant Web App Manifest from brand kit + company display name.
 * Server-hosted per-host manifests and `tenant_app_identities` arrive with the
 * M11 provisioner; this client slice updates the live document after sign-in.
 */
import { brandAssetUrl, type BrandKit } from './brandKit'
import { PRODUCT } from './product'

export const APP_NAME_MAX = 30
export const APP_SHORT_NAME_MAX = 12

/** Reserved short names / impersonation blocklist (spec §5.6.3). */
export const RESERVED_APP_NAMES = [
  'highmast',
  'red reach',
  'redreach',
  'admin',
  'api',
  'support',
  'billing',
  'login',
  'www',
] as const

export type TenantAppIdentityInput = {
  tenantId: string
  companyId?: string | null
  displayName: string
  shortName?: string | null
  primaryColor: string
  backgroundColor?: string
  markUrl?: string | null
  startUrl?: string
  scope?: string
  lang?: string
}

export type WebAppManifest = {
  id: string
  name: string
  short_name: string
  description: string
  start_url: string
  scope: string
  display: 'standalone'
  orientation: 'any'
  background_color: string
  theme_color: string
  lang: string
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>
}

export function clampAppName(name: string, max = APP_NAME_MAX): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max)
}

export function clampAppShortName(name: string, max = APP_SHORT_NAME_MAX): string {
  const cleaned = clampAppName(name, max * 2)
  if (cleaned.length <= max) return cleaned || PRODUCT.shortName
  // Prefer first word / initials-ish cut without trailing space
  return cleaned.slice(0, max).trimEnd() || PRODUCT.shortName
}

export function appNameProblem(name: string): string | null {
  const n = clampAppName(name)
  if (!n) return 'app_name_required'
  if (n.length > APP_NAME_MAX) return 'app_name_too_long'
  const lower = n.toLowerCase()
  if (RESERVED_APP_NAMES.some((r) => lower === r || lower.includes(r))) {
    return 'app_name_reserved'
  }
  return null
}

/** Host slug for tenant_app_identities (e.g. alnoor → alnoor.highmast.app later). */
export function hostSlugProblem(slug: string): string | null {
  const s = String(slug || '')
    .trim()
    .toLowerCase()
  if (!s) return 'host_slug_required'
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) return 'host_slug_invalid'
  if (RESERVED_APP_NAMES.some((r) => s === r.replace(/\s+/g, ''))) return 'host_slug_reserved'
  return null
}

export function fullAppHost(slug: string, root = 'highmast.app'): string {
  const s = String(slug || '')
    .trim()
    .toLowerCase()
  return s ? `${s}.${root}` : root
}

/** Stable manifest id so two tenant installs on one device do not overwrite. */
export function tenantManifestId(tenantId: string, companyId?: string | null): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
  const tid = String(tenantId || 'unknown').trim() || 'unknown'
  const cid = companyId ? `c-${companyId}` : 'tenant'
  return `${base}#tenant=${tid}&${cid}`
}

export function buildTenantWebManifest(input: TenantAppIdentityInput): WebAppManifest {
  const name = clampAppName(input.displayName) || PRODUCT.name
  const short =
    clampAppShortName(input.shortName || name) ||
    clampAppShortName(PRODUCT.shortName)
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
  const startUrl = input.startUrl || `${base}app/`
  const scope = input.scope || base
  const theme = input.primaryColor || PRODUCT.colors.red
  const bg = input.backgroundColor || '#141414'
  const mark = (input.markUrl || '').trim()
  const defaultIcons = [
    { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: `${base}icons/icon-maskable-192.png`,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: `${base}icons/icon-maskable-512.png`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ]
  const icons = mark
    ? [
        { src: mark, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: mark, sizes: '192x192', type: 'image/png', purpose: 'any' },
        ...defaultIcons,
      ]
    : defaultIcons

  return {
    id: tenantManifestId(input.tenantId, input.companyId),
    name,
    short_name: short,
    description: `${name} — workspace on ${PRODUCT.name}`,
    start_url: startUrl,
    scope,
    display: 'standalone',
    orientation: 'any',
    background_color: bg,
    theme_color: theme,
    lang: input.lang || 'en',
    icons,
  }
}

export function identityFromBrandKit(input: {
  tenantId: string
  companyId?: string | null
  companyName?: string | null
  kit: BrandKit
}): TenantAppIdentityInput {
  const displayName =
    clampAppName(input.companyName || '') ||
    clampAppName(input.kit.legal_footer || '') ||
    PRODUCT.name
  const markPath = input.kit.mark_square_path
  return {
    tenantId: input.tenantId,
    companyId: input.companyId,
    displayName,
    shortName: clampAppShortName(displayName),
    primaryColor: input.kit.primary_color || PRODUCT.colors.red,
    backgroundColor: '#141414',
    markUrl: markPath ? brandAssetUrl(markPath) : null,
  }
}

let lastBlobUrl: string | null = null

/**
 * Swap the document's web manifest + theme-color / apple title for the active
 * tenant. Safe to call repeatedly; revokes the previous blob URL.
 */
export function applyTenantWebManifest(
  identity: TenantAppIdentityInput,
  doc: Document = document,
): WebAppManifest {
  const manifest = buildTenantWebManifest(identity)
  const json = JSON.stringify(manifest)
  const blob = new Blob([json], { type: 'application/manifest+json' })
  const url = URL.createObjectURL(blob)

  let link = doc.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
  if (!link) {
    link = doc.createElement('link')
    link.rel = 'manifest'
    doc.head.appendChild(link)
  }
  if (lastBlobUrl) {
    try {
      URL.revokeObjectURL(lastBlobUrl)
    } catch {
      /* ignore */
    }
  }
  lastBlobUrl = url
  link.href = url

  const themeMeta = doc.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (themeMeta) themeMeta.content = manifest.theme_color

  const appleTitle = doc.querySelector(
    'meta[name="apple-mobile-web-app-title"]',
  ) as HTMLMetaElement | null
  if (appleTitle) appleTitle.content = manifest.short_name

  const appName = doc.querySelector('meta[name="application-name"]') as HTMLMetaElement | null
  if (appName) appName.content = manifest.short_name

  // Prefer square mark for apple-touch when available
  const mark = identity.markUrl
  if (mark) {
    for (const el of Array.from(doc.querySelectorAll('link[rel="apple-touch-icon"]'))) {
      ;(el as HTMLLinkElement).href = mark
    }
  }

  return manifest
}
