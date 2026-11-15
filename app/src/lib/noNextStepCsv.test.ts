import { describe, expect, it } from 'vitest'
import type { NoNextStepRow } from './dealRules'
import {
  buildNoNextStepCsvPatch,
  noNextStepToDealStub,
  resolveNoNextStepPipeline,
  takeMatchingNoNextStep,
} from './noNextStepCsv'

const base: NoNextStepRow = {
  key: 'crm:c1',
  pipeline: 'crm',
  name: 'Beta Co',
  stage: 'Lead',
  missing: 'No next action or date',
  link: '/crm?edit=c1',
  owner_user_id: 'u1',
  owner_label: 'Sara',
  next_action: '',
  next_action_date: null,
}

describe('resolveNoNextStepPipeline', () => {
  it('accepts keys and export labels', () => {
    expect(resolveNoNextStepPipeline('crm')).toBe('crm')
    expect(resolveNoNextStepPipeline('AI CRM sales')).toBe('sales')
    expect(resolveNoNextStepPipeline('CTRM Next')).toBe('ctrm')
    expect(resolveNoNextStepPipeline('nope')).toBeNull()
  })
})

describe('takeMatchingNoNextStep', () => {
  it('prefers link, then name + pipeline', () => {
    const remaining: NoNextStepRow[] = [
      base,
      { ...base, key: 'sales:s1', pipeline: 'sales', name: 'Clinic LLC', link: '/accounts/a1', stage: 'lead' },
    ]
    const byLink = takeMatchingNoNextStep(remaining, { link: '/accounts/a1', name: '', pipeline: '' })
    expect(byLink?.key).toBe('sales:s1')
    expect(remaining).toHaveLength(1)
    const byName = takeMatchingNoNextStep(remaining, { name: 'Beta Co', pipeline: 'CRM', stage: 'Lead', link: '' })
    expect(byName?.key).toBe('crm:c1')
    expect(remaining).toHaveLength(0)
  })
})

describe('buildNoNextStepCsvPatch', () => {
  it('fills action + default date from CSV', () => {
    const patch = buildNoNextStepCsvPatch(
      { next_action: 'Call back', next_action_date: '' },
      base,
      new Date('2026-11-05T09:00:00'),
    )
    expect(patch).toEqual({ next_action: 'Call back', next_action_date: '2026-11-10' })
  })

  it('keeps current action when only the date is filled', () => {
    const current = { ...base, next_action: 'Call', missing: 'No date for the next action' }
    const patch = buildNoNextStepCsvPatch({ next_action: '', next_action_date: '2026-11-20' }, current)
    expect(patch).toEqual({ next_action: 'Call', next_action_date: '2026-11-20' })
  })

  it('returns null when still incomplete or unchanged', () => {
    expect(buildNoNextStepCsvPatch({ next_action: '', next_action_date: '' }, base)).toBeNull()
    const complete = { ...base, next_action: 'Call', next_action_date: '2026-11-20' }
    expect(buildNoNextStepCsvPatch({ next_action: 'Call', next_action_date: '2026-11-20' }, complete)).toBeNull()
  })
})

describe('noNextStepToDealStub', () => {
  it('parses pipeline id from the gap key', () => {
    const stub = noNextStepToDealStub(base)
    expect(stub.pipeline).toBe('crm')
    expect(stub.id).toBe('c1')
    expect(stub.open).toBe(true)
  })
})
