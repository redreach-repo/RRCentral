/** M9a client PO tracker helpers. */

export type ClientPoStatus = 'open' | 'partial' | 'fulfilled' | 'canceled'

export function clientPoIsOpen(status: ClientPoStatus | string): boolean {
  return status === 'open' || status === 'partial'
}

export function clientPoSummary(input: {
  poNumber: string
  accountName: string
  amount: number
  currency: string
  status: string
}): string {
  return `${input.accountName} PO ${input.poNumber}: ${input.amount} ${input.currency} (${input.status})`
}

export type ClientPoMatchCandidate = {
  invoiceId: string
  reference: string
  amount: number
  score: number
  reason: string
}

/** Soft-suggest invoice match by amount proximity (never invents payments). */
export function suggestClientPoInvoiceMatch(
  po: { amount: number; currency?: string },
  invoices: { id: string; reference_number?: string; amount?: number; currency?: string; status?: string }[],
): ClientPoMatchCandidate | null {
  const poAmt = Number(po.amount) || 0
  if (poAmt <= 0) return null
  let best: ClientPoMatchCandidate | null = null
  for (const inv of invoices) {
    const st = String(inv.status || '').toLowerCase()
    if (st === 'cancelled' || st === 'canceled' || st === 'draft') continue
    const amt = Number(inv.amount) || 0
    if (amt <= 0) continue
    const delta = Math.abs(amt - poAmt)
    const rel = delta / poAmt
    if (rel > 0.05 && delta > 1) continue
    const score = 1 - Math.min(1, rel)
    const cand: ClientPoMatchCandidate = {
      invoiceId: inv.id,
      reference: String(inv.reference_number || inv.id),
      amount: amt,
      score,
      reason: delta < 0.01 ? 'Exact amount' : `Within ${delta.toFixed(2)} AED`,
    }
    if (!best || cand.score > best.score) best = cand
  }
  return best
}

export function clientPoStatusAfterMatch(poAmount: number, invoiceAmount: number): ClientPoStatus {
  const po = Number(poAmount) || 0
  const inv = Number(invoiceAmount) || 0
  if (po <= 0) return 'fulfilled'
  if (inv + 0.009 >= po) return 'fulfilled'
  if (inv > 0) return 'partial'
  return 'open'
}

/** Status from cumulative received_amount vs PO amount. */
export function clientPoStatusAfterReceipt(poAmount: number, receivedAmount: number): ClientPoStatus {
  return clientPoStatusAfterMatch(poAmount, receivedAmount)
}

export function clientPoRemaining(poAmount: number, receivedAmount: number): number {
  return Math.max(0, Math.round(((Number(poAmount) || 0) - (Number(receivedAmount) || 0)) * 100) / 100)
}
