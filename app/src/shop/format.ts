export const SHIPPING_FILS = 1500
export const FREE_SHIPPING_THRESHOLD_FILS = 15000
export const CURRENCY = 'aed'

/** Format fils (1 AED = 100 fils) for storefront prices. */
export function formatAed(fils: number): string {
  const dirhams = Math.round(Number(fils) || 0) / 100
  const whole = Number.isInteger(dirhams)
  return `AED ${dirhams.toLocaleString('en-AE', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export function shippingFilsFor(subtotalFils: number): number {
  if (subtotalFils <= 0) return 0
  return subtotalFils >= FREE_SHIPPING_THRESHOLD_FILS ? 0 : SHIPPING_FILS
}

export function filsUntilFreeShipping(subtotalFils: number): number {
  return Math.max(0, FREE_SHIPPING_THRESHOLD_FILS - subtotalFils)
}

export function parseSearchQuery(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}
