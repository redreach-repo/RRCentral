/** Trading credit limit helpers (soft gate). */

export type CreditSnapshot = {
  creditLimitAed: number | null
  creditHold: boolean
  openArAed: number
}

export type CreditAccountLike = {
  credit_limit_aed?: number | null
  credit_hold?: boolean
}

export type CreditInvoiceLike = {
  amount?: number | null
  payment_status?: string | null
  status?: string | null
}

/** Open AR = sum of non-cancelled invoices that are not fully Paid. */
export function openArFromInvoices(invoices: CreditInvoiceLike[]): number {
  let sum = 0
  for (const inv of invoices) {
    const st = String(inv.status || '').toLowerCase()
    if (st === 'cancelled' || st === 'canceled') continue
    const pay = String(inv.payment_status || '').toLowerCase()
    if (pay === 'paid') continue
    sum += Number(inv.amount) || 0
  }
  return Math.round(sum * 100) / 100
}

export function creditSnapshotFromAccount(
  account: CreditAccountLike | null | undefined,
  openArAed = 0,
): CreditSnapshot {
  return {
    creditLimitAed:
      account?.credit_limit_aed == null || !Number.isFinite(Number(account.credit_limit_aed))
        ? null
        : Number(account.credit_limit_aed),
    creditHold: Boolean(account?.credit_hold),
    openArAed: Number(openArAed) || 0,
  }
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

/** Soft-warn copy for quote/invoice save (never hard-blocks). */
export function creditWarnMessage(snap: CreditSnapshot, additionalAed = 0): string | null {
  const gate = creditGate(snap, additionalAed)
  return gate.ok ? null : gate.reason
}
