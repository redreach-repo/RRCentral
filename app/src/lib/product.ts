/**
 * HighMast product identity (§0.15 / §5.2).
 * User-facing product name; repo/DB/Edge names stay RR Central for now.
 * After sign-in, tenant brand kits own chrome — HighMast only in footer / About / system mail.
 *
 * Pure module (no import.meta) so Edge Function bundles can import PRODUCT.name.
 */

export const PRODUCT = {
  name: 'HighMast',
  shortName: 'HighMast',
  endorsement: 'by Red Reach',
  tagline: 'CRM, quoting, delivery and finance for growing teams',
  description: 'HighMast — CRM, quoting, delivery and finance by Red Reach',
  /** Tenant document and email footers. */
  poweredBy: 'Powered by HighMast',
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

/** Public paths under `app/public/brand/highmast/A-h-mast/`. Pass Vite `import.meta.env.BASE_URL`. */
export function productAssetUrls(baseUrl: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const dir = `${base}brand/highmast/A-h-mast`
  return {
    /** Dark backgrounds — stacked mark without endorsement (endorsement is separate text). */
    stackedReverse: `${dir}/A_stacked_reverse.png`,
    stackedReverseWithEndorsement: `${dir}/A_stacked_reverse_by-red-reach.png`,
    horizontalReverse: `${dir}/A_horizontal_reverse.png`,
    horizontalReverseWithEndorsement: `${dir}/A_horizontal_reverse_by-red-reach.png`,
    /** Light backgrounds — charcoal/black wordmarks (never use on dark). */
    stackedBlack: `${dir}/A_stacked_black.png`,
    stackedBlackWithEndorsement: `${dir}/A_stacked_black_by-red-reach.png`,
    horizontalBlack: `${dir}/A_horizontal_black.png`,
    horizontalBlackWithEndorsement: `${dir}/A_horizontal_black_by-red-reach.png`,
    horizontalDuo: `${dir}/A_horizontal_duo.png`,
    horizontalDuoWithEndorsement: `${dir}/A_horizontal_duo_by-red-reach.png`,
    symbolReverse: `${dir}/A_symbol_reverse.svg`,
    symbolReversePng: `${dir}/A_symbol_reverse.png`,
    symbolWhite: `${dir}/A_symbol_white.svg`,
    favicon: `${dir}/A_favicon_full.png`,
    appIconFull: `${dir}/A_app-icon_full.png`,
    appIconDark: `${dir}/A_app-icon_dark.png`,
  } as const
}
