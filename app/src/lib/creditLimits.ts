/** Trading credit limit helpers (soft gate). */

export type CreditSnapshot = {
  creditLimitAed: number | null
  creditHold: boolean
  openArAed: number
}

export function creditGate(snap: CreditSnapshot, additionalAed = 0): {
  ok: boolean
  reason: string
} {
  if (snap.creditHold) return { ok: false, reason: 'Account is on credit hold' }
  if (snap.creditLimitAed == null || !Number.isFinite(snap.creditLimitAed)) {
    return { ok: true, reason: '' }
  }
  const exposure = (Number(snap.openArAed) || 0) + (Number(additionalAed) || 0)
  if (exposure > Number(snap.creditLimitAed)) {
    return {
      ok: false,
      reason: `Exposure ${exposure.toFixed(2)} AED exceeds credit limit ${Number(snap.creditLimitAed).toFixed(2)} AED`,
    }
  }
  return { ok: true, reason: '' }
}

export function remainingCredit(snap: CreditSnapshot): number | null {
  if (snap.creditLimitAed == null || !Number.isFinite(snap.creditLimitAed)) return null
  return Math.round((Number(snap.creditLimitAed) - (Number(snap.openArAed) || 0)) * 100) / 100
}
