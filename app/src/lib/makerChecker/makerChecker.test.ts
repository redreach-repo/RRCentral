import { describe, expect, it } from 'vitest'
import {
  ACTION_KEY_RE,
  approvalRequired,
  canCancel,
  canDecide,
  canRaise,
  decisionProblem,
  sortForQueue,
  type ApprovalPolicy,
  type ApprovalRequest,
} from './makerChecker'

const policies: ApprovalPolicy[] = [
  { id: '1', action_key: 'payroll.run', label: '', min_amount: null, required: true, active: true },
  { id: '2', action_key: 'expense.large', label: '', min_amount: 10000, required: true, active: true },
  { id: '3', action_key: 'off', label: '', min_amount: null, required: true, active: false },
  { id: '4', action_key: 'optional', label: '', min_amount: null, required: false, active: true },
]

const req = (over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'r',
  action_key: 'payroll.run',
  entity_type: '',
  entity_id: '',
  summary: 'x',
  payload: {},
  amount: null,
  currency: 'AED',
  status: 'pending',
  maker_email: 'maker@redreach.ae',
  checker_email: null,
  decision_reason: '',
  decided_at: null,
  created_at: '2026-11-14T10:00:00Z',
  ...over,
})

describe('approvalRequired', () => {
  it('follows active, required and the amount limit', () => {
    expect(approvalRequired(policies, 'payroll.run')).toBe(true)
    expect(approvalRequired(policies, 'expense.large', 9999.99)).toBe(false)
    expect(approvalRequired(policies, 'expense.large', 10000)).toBe(true)
    expect(approvalRequired(policies, 'expense.large', null)).toBe(false)
    expect(approvalRequired(policies, 'off')).toBe(false)
    expect(approvalRequired(policies, 'optional')).toBe(false)
    expect(approvalRequired(policies, 'missing')).toBe(false)
  })
})

describe('four eyes', () => {
  it('maker can never decide own request, whatever the role', () => {
    expect(canDecide(req(), 'admin', 'Maker@RedReach.ae')).toBe(false)
  })
  it('only manager and admin decide', () => {
    for (const role of ['viewer', 'staff', 'sales'] as const) expect(canDecide(req(), role, 'x@redreach.ae')).toBe(false)
    expect(canDecide(req(), 'manager', 'x@redreach.ae')).toBe(true)
    expect(canDecide(req(), 'admin', 'x@redreach.ae')).toBe(true)
  })
  it('decided requests are final', () => {
    expect(canDecide(req({ status: 'approved' }), 'admin', 'x@redreach.ae')).toBe(false)
  })
  it('only maker cancels a pending request', () => {
    expect(canCancel(req(), 'maker@redreach.ae')).toBe(true)
    expect(canCancel(req(), 'x@redreach.ae')).toBe(false)
    expect(canCancel(req({ status: 'rejected' }), 'maker@redreach.ae')).toBe(false)
  })
  it('viewers cannot raise', () => {
    expect(canRaise('viewer')).toBe(false)
    expect(canRaise('staff')).toBe(true)
    expect(canRaise(null)).toBe(false)
  })
  it('reject needs a reason', () => {
    expect(decisionProblem(false, '  ')).not.toBeNull()
    expect(decisionProblem(true, '')).toBeNull()
  })
})

describe('queue order and keys', () => {
  it('pending first, newest first', () => {
    const rows = sortForQueue([
      req({ id: 'a', status: 'approved', created_at: '2026-11-14T12:00:00Z' }),
      req({ id: 'b', created_at: '2026-11-13T12:00:00Z' }),
      req({ id: 'c', created_at: '2026-11-14T12:00:00Z' }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })
  it('action keys match the SQL check', () => {
    expect(ACTION_KEY_RE.test('payroll.run')).toBe(true)
    expect(ACTION_KEY_RE.test('Payroll Run')).toBe(false)
  })
})
