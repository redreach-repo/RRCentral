import { DEFAULT_LOGO_URL } from './brand'
import { REDREACH_COMPANY_ID, REDREACH_TENANT_ID } from '../modules/registry'

export type BrandFontChoice = 'dm_sans' | 'ibm_plex_sans' | 'source_serif' | 'system'
export type BrandDensity = 'compact' | 'comfortable' | 'spacious'

export type BrandFonts = {
  heading: BrandFontChoice
  body: BrandFontChoice
  density: BrandDensity
}

export type BrandKit = {
  id?: string
  tenant_id: string
  company_id: string | null
  business_unit_id: string | null
  primary_color: string
  accent_color: string
  neutral_dark: string
  neutral_light: string
  logo_horizontal_path: string | null
  logo_light_path: string | null
  mark_square_path: string | null
  legal_footer: string
  fonts: BrandFonts
}

export const DEFAULT_BRAND_FONTS: BrandFonts = {
  heading: 'dm_sans',
  body: 'dm_sans',
  density: 'comfortable',
}

export const BRAND_FONT_OPTIONS: Array<{ key: BrandFontChoice; label: string; css: string }> = [
  { key: 'dm_sans', label: 'DM Sans', css: "'DM Sans', system-ui, -apple-system, sans-serif" },
  { key: 'ibm_plex_sans', label: 'IBM Plex Sans', css: "'IBM Plex Sans', system-ui, sans-serif" },
  { key: 'source_serif', label: 'Source Serif 4', css: "'Source Serif 4', Georgia, serif" },
  { key: 'system', label: 'System UI', css: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' },
]

export const BRAND_DENSITY_OPTIONS: Array<{ key: BrandDensity; label: string; scale: string }> = [
  { key: 'compact', label: 'Compact', scale: '0.88' },
  { key: 'comfortable', label: 'Comfortable', scale: '1' },
  { key: 'spacious', label: 'Spacious', scale: '1.12' },
]

/** Columns selected for brand kits (keep in sync across store + TenantContext). */
export const BRAND_KIT_COLUMNS =
  'id, tenant_id, company_id, business_unit_id, primary_color, accent_color, neutral_dark, neutral_light, logo_horizontal_path, logo_light_path, mark_square_path, legal_footer, fonts'

/** Client seed matching brand-assets/brand.json + DB seed (offline / local mode). */
export const REDREACH_DEFAULT_BRAND: BrandKit = {
  tenant_id: REDREACH_TENANT_ID,
  company_id: REDREACH_COMPANY_ID,
  business_unit_id: null,
  primary_color: '#C8321A',
  accent_color: '#E8872A',
  neutral_dark: '#1A1A1A',
  neutral_light: '#FFFFFF',
  logo_horizontal_path: 'brand/redreach/redreach-middle-east-fze.png',
  logo_light_path: null,
  mark_square_path: 'brand/redreach/mark/redreach-mark-square.jpg',
  legal_footer: 'Red Reach Middle East FZE',
  fonts: { ...DEFAULT_BRAND_FONTS },
}

/** Named starter palettes for Theme Studio. */
export const BRAND_PRESETS: Array<{
  key: string
  name: string
  kit: Pick<BrandKit, 'primary_color' | 'accent_color' | 'neutral_dark' | 'neutral_light'> & {
    fonts?: Partial<BrandFonts>
  }
}> = [
  {
    key: 'highmast_red',
    name: 'HighMast red',
    kit: {
      primary_color: '#C8321A',
      accent_color: '#E8872A',
      neutral_dark: '#1A1A1A',
      neutral_light: '#FFFFFF',
      fonts: { heading: 'dm_sans', body: 'dm_sans', density: 'comfortable' },
    },
  },
  {
    key: 'coastal_teal',
    name: 'Coastal teal',
    kit: {
      primary_color: '#0F6B6B',
      accent_color: '#D4A017',
      neutral_dark: '#14212B',
      neutral_light: '#F7F4EF',
      fonts: { heading: 'source_serif', body: 'ibm_plex_sans', density: 'comfortable' },
    },
  },
  {
    key: 'ink_slate',
    name: 'Ink slate',
    kit: {
      primary_color: '#1E3A5F',
      accent_color: '#C45C26',
      neutral_dark: '#111827',
      neutral_light: '#F8FAFC',
      fonts: { heading: 'ibm_plex_sans', body: 'ibm_plex_sans', density: 'compact' },
    },
  },
]

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const FONT_KEYS = new Set<BrandFontChoice>(['dm_sans', 'ibm_plex_sans', 'source_serif', 'system'])
const DENSITY_KEYS = new Set<BrandDensity>(['compact', 'comfortable', 'spacious'])

export function isHexColor(value: string): boolean {
  return HEX.test(String(value || '').trim())
}

/** Expand #abc → #aabbcc; return null if invalid. */
export function normalizeHexColor(value: string): string | null {
  const raw = String(value || '').trim()
  if (!HEX.test(raw)) return null
  if (raw.length === 4) {
    const r = raw[1]
    const g = raw[2]
    const b = raw[3]
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return raw.toUpperCase()
}

export function normalizeBrandFonts(raw: unknown): BrandFonts {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const heading = FONT_KEYS.has(obj.heading as BrandFontChoice)
    ? (obj.heading as BrandFontChoice)
    : DEFAULT_BRAND_FONTS.heading
  const body = FONT_KEYS.has(obj.body as BrandFontChoice)
    ? (obj.body as BrandFontChoice)
    : DEFAULT_BRAND_FONTS.body
  const density = DENSITY_KEYS.has(obj.density as BrandDensity)
    ? (obj.density as BrandDensity)
    : DEFAULT_BRAND_FONTS.density
  return { heading, body, density }
}

export function fontStack(choice: BrandFontChoice): string {
  return BRAND_FONT_OPTIONS.find((o) => o.key === choice)?.css || BRAND_FONT_OPTIONS[0].css
}

export function densityScale(density: BrandDensity): string {
  return BRAND_DENSITY_OPTIONS.find((o) => o.key === density)?.scale || '1'
}

export function brandAssetUrl(path: string | null | undefined): string {
  const trimmed = String(path || '').trim()
  if (!trimmed) return DEFAULT_LOGO_URL
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) return trimmed
  const base = import.meta.env.BASE_URL || '/'
  const normalized = trimmed.replace(/^\//, '')
  return `${base}${normalized}`
}

/** Normalize a row from Supabase (fonts may be missing/empty). */
export function coerceBrandKit(row: Partial<BrandKit> & { fonts?: unknown }): BrandKit {
  return {
    id: row.id,
    tenant_id: String(row.tenant_id || REDREACH_TENANT_ID),
    company_id: row.company_id ?? null,
    business_unit_id: row.business_unit_id ?? null,
    primary_color: row.primary_color || REDREACH_DEFAULT_BRAND.primary_color,
    accent_color: row.accent_color || REDREACH_DEFAULT_BRAND.accent_color,
    neutral_dark: row.neutral_dark || REDREACH_DEFAULT_BRAND.neutral_dark,
    neutral_light: row.neutral_light || REDREACH_DEFAULT_BRAND.neutral_light,
    logo_horizontal_path: row.logo_horizontal_path ?? null,
    logo_light_path: row.logo_light_path ?? null,
    mark_square_path: row.mark_square_path ?? null,
    legal_footer: row.legal_footer || '',
    fonts: normalizeBrandFonts(row.fonts),
  }
}

export function applyBrandCssVars(kit: BrandKit, root: HTMLElement = document.documentElement) {
  const fonts = normalizeBrandFonts(kit.fonts)
  root.style.setProperty('--rr-brand-primary', kit.primary_color)
  root.style.setProperty('--rr-brand-accent', kit.accent_color)
  root.style.setProperty('--rr-brand-dark', kit.neutral_dark)
  root.style.setProperty('--rr-brand-light', kit.neutral_light)
  // Map tenant kit onto HighMast design tokens used by chrome (after sign-in).
  root.style.setProperty('--primary', kit.primary_color)
  root.style.setProperty('--accent', kit.accent_color)
  root.style.setProperty('--font-heading', fontStack(fonts.heading))
  root.style.setProperty('--font-body', fontStack(fonts.body))
  root.style.setProperty('--rr-density', densityScale(fonts.density))
  root.dataset.density = fonts.density
}

export type BrandKitDraft = {
  primary_color: string
  accent_color: string
  neutral_dark: string
  neutral_light: string
  logo_horizontal_path: string
  logo_light_path: string
  mark_square_path: string
  legal_footer: string
  heading_font: BrandFontChoice
  body_font: BrandFontChoice
  density: BrandDensity
}

export function brandKitToDraft(kit: BrandKit): BrandKitDraft {
  const fonts = normalizeBrandFonts(kit.fonts)
  return {
    primary_color: kit.primary_color,
    accent_color: kit.accent_color,
    neutral_dark: kit.neutral_dark,
    neutral_light: kit.neutral_light,
    logo_horizontal_path: kit.logo_horizontal_path || '',
    logo_light_path: kit.logo_light_path || '',
    mark_square_path: kit.mark_square_path || '',
    legal_footer: kit.legal_footer || '',
    heading_font: fonts.heading,
    body_font: fonts.body,
    density: fonts.density,
  }
}

export function brandKitDraftProblem(draft: BrandKitDraft): string | null {
  for (const key of ['primary_color', 'accent_color', 'neutral_dark', 'neutral_light'] as const) {
    if (!normalizeHexColor(draft[key])) return `${key.replace('_', ' ')} must be a hex colour (#RGB or #RRGGBB)`
  }
  if (!FONT_KEYS.has(draft.heading_font)) return 'heading font is invalid'
  if (!FONT_KEYS.has(draft.body_font)) return 'body font is invalid'
  if (!DENSITY_KEYS.has(draft.density)) return 'density is invalid'
  return null
}

export function draftToBrandKitPatch(draft: BrandKitDraft): Omit<
  BrandKit,
  'id' | 'tenant_id' | 'company_id' | 'business_unit_id'
> {
  return {
    primary_color: normalizeHexColor(draft.primary_color)!,
    accent_color: normalizeHexColor(draft.accent_color)!,
    neutral_dark: normalizeHexColor(draft.neutral_dark)!,
    neutral_light: normalizeHexColor(draft.neutral_light)!,
    logo_horizontal_path: draft.logo_horizontal_path.trim() || null,
    logo_light_path: draft.logo_light_path.trim() || null,
    mark_square_path: draft.mark_square_path.trim() || null,
    legal_footer: draft.legal_footer.trim(),
    fonts: {
      heading: draft.heading_font,
      body: draft.body_font,
      density: draft.density,
    },
  }
}

/** Relative luminance 0–1 (sRGB). */
export function relativeLuminance(hex: string): number {
  const n = normalizeHexColor(hex)
  if (!n) return 0
  const r = parseInt(n.slice(1, 3), 16) / 255
  const g = parseInt(n.slice(3, 5), 16) / 255
  const b = parseInt(n.slice(5, 7), 16) / 255
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const a = relativeLuminance(fgHex)
  const b = relativeLuminance(bgHex)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
}
