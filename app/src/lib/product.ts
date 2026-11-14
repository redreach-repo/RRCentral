/**
 * HighMast product identity (§0.15 / §5.2).
 * User-facing product name; repo/DB/Edge names stay RR Central for now.
 * After sign-in, tenant brand kits (e.g. Red Reach) own chrome — not this constant.
 *
 * Pure module (no import.meta) so Edge Function bundles can import PRODUCT.name.
 */

export const PRODUCT = {
  name: 'HighMast',
  shortName: 'HighMast',
  endorsement: 'by Red Reach',
  tagline: 'CRM, quoting, delivery and finance for growing teams',
  description: 'HighMast — CRM, quoting, delivery and finance by Red Reach',
  colors: {
    red: '#C8321A',
    orange: '#E8872A',
    charcoal: '#1A1A1A',
    grey: '#6E6E6E',
    warmGrey: '#B8B2AC',
    paper: '#F7F4F1',
  },
} as const

export type Product = typeof PRODUCT

/** Public paths under `app/public/brand/highmast/`. Pass Vite `import.meta.env.BASE_URL`. */
export function productAssetUrls(baseUrl: string): { symbol: string; stacked: string } {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return {
    symbol: `${base}brand/highmast/highmast-symbol.png`,
    stacked: `${base}brand/highmast/highmast-stacked.png`,
  }
}
