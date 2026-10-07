/** Format fils integer as AED display string. */
export function formatAed(fils: number): string {
  const aed = fils / 100
  if (Number.isInteger(aed)) return `AED ${aed}`
  return `AED ${aed.toFixed(2)}`
}

export function aedToFils(aed: number): number {
  return Math.round(aed * 100)
}

export function deliveryFeeFils(
  subtotalFils: number,
  freeAbove = Number(process.env.NEXT_PUBLIC_FREE_DELIVERY_FILS || 20000),
  flat = Number(process.env.NEXT_PUBLIC_DELIVERY_FEE_FILS || 1500),
): number {
  if (subtotalFils <= 0) return 0
  return subtotalFils >= freeAbove ? 0 : flat
}
