import { describe, expect, it } from 'vitest'
import {
  buildApprovalStep,
  buildNotifyStep,
  describeWorkflowTrigger,
  parseWorkflowSteps,
  slugifyWorkflowKey,
} from './workflows'

describe('workflows helpers', () => {
  it('slugifies workflow keys', () => {
    expect(slugifyWorkflowKey('CRM Won Approval')).toBe('crm_won_approval')
  })

  it('builds approval and notify steps', () => {
    expect(buildApprovalStep({ approverRole: 'admin' }).type).toBe('approval')
    expect(buildNotifyStep({ message: 'hi' }).config.message).toBe('hi')
  })

  it('parses steps and drops junk', () => {
    expect(
      parseWorkflowSteps([
        { type: 'approval', name: 'OK', config: { approver_role: 'admin' } },
        { type: 'nope' },
        null,
      ]),
    ).toEqual([{ type: 'approval', name: 'OK', config: { approver_role: 'admin' } }])
  })

  it('describes stage_enter triggers', () => {
    expect(
      describeWorkflowTrigger({
        trigger_type: 'stage_enter',
        trigger_config: { pipeline_key: 'crm', stage_key: 'Won' },
      }),
    ).toBe('When crm enters Won')
  })
})
