/** Maker-checker: approval request state machine + money-action gates. */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'canceled'

export type ApprovalDecision = 'approve' | 'reject' | 'cancel'

export const DEFAULT_APPROVAL_THRESHOLD_AED = 5000

export function nextApprovalStatus(
  current: ApprovalStatus,
  decision: ApprovalDecision,
): ApprovalStatus | null {
  if (current !== 'pending') return null
  if (decision === 'approve') return 'approved'
  if (decision === 'reject') return 'rejected'
  return 'canceled'
}

export function approvalNeedsChecker(
  amountAed: number | null | undefined,
  thresholdAed = DEFAULT_APPROVAL_THRESHOLD_AED,
): boolean {
  const n = Number(amountAed)
  if (!Number.isFinite(n)) return false
  return n >= thresholdAed
}

/** Maker cannot approve/reject their own request; cancel by maker is allowed. */
export function canDecideApproval(input: {
  status: ApprovalStatus
  requestedBy: string | null | undefined
  decidedBy: string | null | undefined
  decision?: ApprovalDecision
}): boolean {
  if (input.status !== 'pending') return false
  const maker = (input.requestedBy || '').trim()
  const actor = (input.decidedBy || '').trim()
  if (!actor) return false
  if (input.decision === 'cancel') return true
  if (maker && maker === actor) return false
  return true
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

export type MoneyActionGate =
  | { ok: true; needsApproval: false }
  | { ok: true; needsApproval: true; reason: string }
  | { ok: false; reason: string }

/** Gate a money action: below threshold proceeds; at/above requires a pending/approved request. */
export function gateMoneyAction(input: {
  amountAed: number
  thresholdAed?: number
  existingStatus?: ApprovalStatus | null
}): MoneyActionGate {
  const threshold = input.thresholdAed ?? DEFAULT_APPROVAL_THRESHOLD_AED
  if (!approvalNeedsChecker(input.amountAed, threshold)) {
    return { ok: true, needsApproval: false }
  }
  if (input.existingStatus === 'approved') {
    return { ok: true, needsApproval: false }
  }
  if (input.existingStatus === 'pending') {
    return { ok: false, reason: 'Waiting on maker-checker approval' }
  }
  if (input.existingStatus === 'rejected' || input.existingStatus === 'canceled') {
    return { ok: false, reason: 'Prior approval was not approved — request again' }
  }
  return {
    ok: true,
    needsApproval: true,
    reason: `Amount AED ${Number(input.amountAed).toFixed(2)} requires a second approver (≥ ${threshold})`,
  }
}
