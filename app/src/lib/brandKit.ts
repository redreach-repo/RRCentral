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
}
