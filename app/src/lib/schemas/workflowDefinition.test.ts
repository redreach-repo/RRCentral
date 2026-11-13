import { describe, expect, it } from 'vitest'
import { parseWorkflowDefinitionForm } from './workflowDefinition'

const base = {
  name: 'Won approval',
  description: ' Needs a check ',
  trigger_type: 'stage_enter',
  pipeline_key: 'crm',
  stage_key: 'Won',
  approver_role: 'admin',
  notify_message: 'Approved',
  active: true,
}

describe('parseWorkflowDefinitionForm', () => {
  it('accepts a stage-enter workflow', () => {
    const r = parseWorkflowDefinitionForm(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.name).toBe('Won approval')
    expect(r.data.description).toBe('Needs a check')
    expect(r.data.trigger_type).toBe('stage_enter')
  })

  it('requires a name', () => {
    const r = parseWorkflowDefinitionForm({ ...base, name: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Name/i)
  })

  it('requires pipeline and stage for stage_enter', () => {
    const r = parseWorkflowDefinitionForm({ ...base, pipeline_key: '', stage_key: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Pipeline key|Stage key/)
  })
})
