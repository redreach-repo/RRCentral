import { describe, expect, it } from 'vitest'
import {
  matchesStageEnter,
  processSteps,
  roleCanApprove,
} from './workflowRunner'
import {
  buildApprovalStep,
  buildCreateRecordStep,
  buildNotifyStep,
  buildUpdateFieldStep,
} from './workflows'

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

  it('dry-logs webhook without outbound', () => {
    const result = processSteps(
      [{ type: 'webhook', name: 'Ping', config: { url: 'https://example.test/hook' } }],
      0,
      { notifications: [], step_log: [] },
    )
    expect(result.status).toBe('completed')
    expect(result.context.webhook_dry_logs?.[0]?.url).toContain('example.test')
    expect(result.context.step_log?.[0]?.status).toBe('done')
  })

  it('dry-logs ask_ai without gateway', () => {
    const result = processSteps(
      [{ type: 'ask_ai', name: 'Ask', config: { prompt: 'Summarise this deal' } }],
      0,
      { notifications: [], step_log: [], object_type: 'deal', record_id: 'd1' },
    )
    expect(result.status).toBe('completed')
    expect(result.context.ask_ai_dry_logs?.[0]?.prompt).toMatch(/Summarise/)
    expect(result.context.step_log?.[0]?.status).toBe('done')
  })

  it('fails ask_ai without prompt', () => {
    const result = processSteps(
      [{ type: 'ask_ai', name: '', config: {} }],
      0,
      { notifications: [], step_log: [] },
    )
    expect(result.status).toBe('failed')
  })

  it('applies update_field and create_record into context', () => {
    const result = processSteps(
      [
        buildUpdateFieldStep({ fieldKey: 'status', value: 'Won' }),
        buildCreateRecordStep({ objectType: 'task', label: 'Follow up' }),
      ],
      0,
      { object_type: 'deal', record_id: 'd1', notifications: [], step_log: [] },
    )
    expect(result.status).toBe('completed')
    expect(result.context.field_updates?.[0]).toMatchObject({ field_key: 'status', value: 'Won' })
    expect(result.context.created_records?.[0]).toMatchObject({ object_type: 'task', label: 'Follow up' })
  })
})
