/** Engineering pack foundation helpers. */

export const ENG_DOC_STATUSES = ['draft', 'issued', 'superseded', 'void'] as const
export const ENG_CLAIM_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'withdrawn'] as const

export function engDocLabel(docNo: string, title: string): string {
  const n = docNo.trim()
  return n ? `${n} · ${title}` : title
}

export function engClaimLabel(claimNo: string, title: string, amountAed: number): string {
  const n = claimNo.trim()
  const head = n ? `${n} · ${title}` : title
  return `${head} · AED ${Number(amountAed || 0).toFixed(2)}`
}
