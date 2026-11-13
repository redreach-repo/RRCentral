import { describe, expect, it } from 'vitest'
import {
  matchesStageEnter,
  processSteps,
  roleCanApprove,
} from './workflowRunner'
import { buildApprovalStep, buildNotifyStep } from './workflows'

describe('workflowRunner helpers', () => {
  it('matches stage_enter triggers', () => {
    expect(
      matchesStageEnter(
        {
          active: true,
          trigger_type: 'stage_enter',
          trigger_config: { pipeline_key: 'crm', stage_key: 'Won' },
        },
        'crm',
        'Won',
      ),
    ).toBe(true)
    expect(
      matchesStageEnter(
        {
          active: true,
          trigger_type: 'stage_enter',
          trigger_config: { pipeline_key: 'crm', stage_key: 'Won' },
        },
        'crm',
        'Lost',
      ),
    ).toBe(false)
  })

  it('checks approver roles', () => {
    expect(roleCanApprove('admin', 'admin')).toBe(true)
    expect(roleCanApprove('manager', 'admin')).toBe(false)
    expect(roleCanApprove('manager', 'manager')).toBe(true)
    expect(roleCanApprove('admin', 'manager')).toBe(true)
  })

  it('pauses on approval then completes notify after resume index', () => {
    const steps = [
      buildApprovalStep({ name: 'Admin confirm', approverRole: 'admin' }),
      buildNotifyStep({ name: 'Notify owner', message: 'Won deal approved' }),
    ]
    const paused = processSteps(steps, 0, { notifications: [], step_log: [] })
    expect(paused.status).toBe('awaiting_approval')
    expect(paused.current_step).toBe(0)

    const done = processSteps(steps, 1, paused.context)
    expect(done.status).toBe('completed')
    expect(done.context.notifications).toContain('Won deal approved')
  })

  it('skips unsupported step types', () => {
    const result = processSteps(
      [{ type: 'webhook', name: 'Ping', config: {} }],
      0,
      { notifications: [], step_log: [] },
    )
    expect(result.status).toBe('completed')
    expect(result.context.step_log?.[0]?.status).toBe('skipped')
  })
})
