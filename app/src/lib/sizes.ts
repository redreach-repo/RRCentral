/** Standard apparel size run used on quotes and inventory. */
export const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const

export type StandardSize = (typeof STANDARD_SIZES)[number]
export type SizeBreakdown = Partial<Record<string, number>>

export function emptySizeBreakdown(): SizeBreakdown {
  const out: SizeBreakdown = {}
  for (const s of STANDARD_SIZES) out[s] = 0
  return out
}

export function sumSizes(sizes?: SizeBreakdown | null): number {
  if (!sizes) return 0
  let total = 0
  for (const v of Object.values(sizes)) total += Number(v) || 0
  return total
}

export function formatSizes(sizes?: SizeBreakdown | null): string {
  if (!sizes) return ''
  const parts: string[] = []
  for (const s of STANDARD_SIZES) {
    const n = Number(sizes[s] || 0)
    if (n > 0) parts.push(`${s}:${n}`)
  }
  // include any non-standard keys
  for (const [k, v] of Object.entries(sizes)) {
    if ((STANDARD_SIZES as readonly string[]).includes(k)) continue
    const n = Number(v) || 0
    if (n > 0) parts.push(`${k}:${n}`)
  }
  return parts.join(' ')
}

export function parseSizesJson(raw: unknown): SizeBreakdown | null {
  if (!raw) return null
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const out: SizeBreakdown = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n) && n !== 0) out[k] = n
  }
  return Object.keys(out).length ? out : null
}

export function sizesEqualQty(sizes: SizeBreakdown | null | undefined, qty: number): boolean {
  if (!sizes) return true
  return sumSizes(sizes) === Number(qty || 0)
}
