/**
 * Maker-checker (four eyes) rules, mirrored from
 * supabase/migrations/20261220090000_maker_checker.sql. The database is the
 * authority; these helpers only decide what the UI offers.
 */
import { roleAtLeast } from '../permissions'
import type { UserRole } from '../types'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type ApprovalPolicy = {
  id: string
  action_key: string
  label: string
  min_amount: number | null
  required: boolean
  active: boolean
}

export type ApprovalRequest = {
  id: string
  action_key: string
  entity_type: string
  entity_id: string
  summary: string
  payload: Record<string, unknown>
  amount: number | null
  currency: string
  status: ApprovalStatus
  maker_email: string
  checker_email: string | null
  decision_reason: string
  decided_at: string | null
  created_at: string
}

export const ACTION_KEY_RE = /^[a-z0-9_.]+$/

/** Same rule as rr_approval_required(): active + required + amount at or above the limit. */
export function approvalRequired(
  policies: ApprovalPolicy[],
  actionKey: string,
  amount: number | null = null,
): boolean {
  const p = policies.find((x) => x.action_key === actionKey && x.active)
  if (!p || !p.required) return false
  if (p.min_amount == null) return true
  return (amount ?? 0) >= p.min_amount
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Whether this user may approve or reject this request (manager/admin, pending, not the maker). */
export function canDecide(req: ApprovalRequest, role: UserRole | null | undefined, email: string | null | undefined): boolean {
  if (req.status !== 'pending') return false
  if (!roleAtLeast(role, 'manager')) return false
  if (!email) return false
  return !same(req.maker_email, email)
}

/** Only the maker can cancel, and only while pending. */
export function canCancel(req: ApprovalRequest, email: string | null | undefined): boolean {
  return req.status === 'pending' && same(req.maker_email, email)
}

/** Viewers cannot raise requests; everyone else on the team can. */
export function canRaise(role: UserRole | null | undefined): boolean {
  return !!role && role !== 'viewer'
}

/** Reason needed when rejecting. Returns an error message or null. */
export function decisionProblem(approve: boolean, reason: string): string | null {
  if (!approve && !reason.trim()) return 'Give a reason when rejecting'
  return null
}

export function sortForQueue(rows: ApprovalRequest[]): ApprovalRequest[] {
  const rank: Record<ApprovalStatus, number> = { pending: 0, approved: 1, rejected: 1, cancelled: 2 }
  return rows.slice().sort((a, b) => rank[a.status] - rank[b.status] || b.created_at.localeCompare(a.created_at))
}
