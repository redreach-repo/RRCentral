import { DEFAULT_LOGO_URL } from './brand'
import { REDREACH_COMPANY_ID, REDREACH_TENANT_ID } from '../modules/registry'

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
}

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
}

/** Named starter palettes for Theme Studio (not full §5.3 font/layout studio). */
export const BRAND_PRESETS: Array<{ key: string; name: string; kit: Pick<BrandKit, 'primary_color' | 'accent_color' | 'neutral_dark' | 'neutral_light'> }> =
  [
    {
      key: 'highmast_red',
      name: 'HighMast red',
      kit: {
        primary_color: '#C8321A',
        accent_color: '#E8872A',
        neutral_dark: '#1A1A1A',
        neutral_light: '#FFFFFF',
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
      },
    },
  ]

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

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

export function brandAssetUrl(path: string | null | undefined): string {
  const trimmed = String(path || '').trim()
  if (!trimmed) return DEFAULT_LOGO_URL
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) return trimmed
  const base = import.meta.env.BASE_URL || '/'
  const normalized = trimmed.replace(/^\//, '')
  return `${base}${normalized}`
}

export function applyBrandCssVars(kit: BrandKit, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--rr-brand-primary', kit.primary_color)
  root.style.setProperty('--rr-brand-accent', kit.accent_color)
  root.style.setProperty('--rr-brand-dark', kit.neutral_dark)
  root.style.setProperty('--rr-brand-light', kit.neutral_light)
  // Map tenant kit onto HighMast design tokens used by chrome (after sign-in).
  root.style.setProperty('--primary', kit.primary_color)
  root.style.setProperty('--accent', kit.accent_color)
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
}

export function brandKitToDraft(kit: BrandKit): BrandKitDraft {
  return {
    primary_color: kit.primary_color,
    accent_color: kit.accent_color,
    neutral_dark: kit.neutral_dark,
    neutral_light: kit.neutral_light,
    logo_horizontal_path: kit.logo_horizontal_path || '',
    logo_light_path: kit.logo_light_path || '',
    mark_square_path: kit.mark_square_path || '',
    legal_footer: kit.legal_footer || '',
  }
}

export function brandKitDraftProblem(draft: BrandKitDraft): string | null {
  for (const key of ['primary_color', 'accent_color', 'neutral_dark', 'neutral_light'] as const) {
    if (!normalizeHexColor(draft[key])) return `${key.replace('_', ' ')} must be a hex colour (#RGB or #RRGGBB)`
  }
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
