/** Maker-checker first slice: approval request state machine. */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'canceled'

export type ApprovalDecision = 'approve' | 'reject' | 'cancel'

export function nextApprovalStatus(
  current: ApprovalStatus,
  decision: ApprovalDecision,
): ApprovalStatus | null {
  if (current !== 'pending') return null
  if (decision === 'approve') return 'approved'
  if (decision === 'reject') return 'rejected'
  return 'canceled'
}

export function approvalNeedsChecker(amountAed: number | null | undefined, thresholdAed = 5000): boolean {
  const n = Number(amountAed)
  if (!Number.isFinite(n)) return false
  return n >= thresholdAed
}

export function summarizeApproval(input: {
  objectType: string
  action: string
  amountAed?: number | null
}): string {
  const amount =
    input.amountAed != null && Number.isFinite(Number(input.amountAed))
      ? ` · AED ${Number(input.amountAed).toFixed(2)}`
      : ''
  return `${input.action} ${input.objectType}${amount}`
}
