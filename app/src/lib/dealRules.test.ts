import { describe, expect, it } from 'vitest'
import { LOST_REASONS, crmMoveProblem, defaultNextActionDate, isLostReason, lostText, noNextStep, stageMoveProblem } from './dealRules'

describe('stageMoveProblem', () => {
  const open = { open: true, lost: false, next_action: 'Call', next_action_date: '2026-11-03' }
  it('needs a next action and date to move into an open stage', () => {
    expect(stageMoveProblem(open)).toBeNull()
    expect(stageMoveProblem({ ...open, next_action: ' ' })).toBe('Every open deal needs a next action')
    expect(stageMoveProblem({ ...open, next_action_date: null })).toBe('Give the next action a date')
  })
  it('needs a listed reason and a note to move to Lost', () => {
    const lost = { open: false, lost: true, next_action: '', next_action_date: null }
    expect(stageMoveProblem(lost)).toBe('Pick why the deal was lost')
    expect(stageMoveProblem({ ...lost, lost_reason_code: 'They vanished', lost_note: 'x' })).toBe('Pick why the deal was lost')
    expect(stageMoveProblem({ ...lost, lost_reason_code: 'Price', lost_note: ' ' })).toBe('Add a note on why the deal was lost')
    expect(stageMoveProblem({ ...lost, lost_reason_code: 'Price', lost_note: 'Too dear' })).toBeNull()
  })
  it('asks nothing for won or signed', () => {
    expect(stageMoveProblem({ open: false, lost: false, next_action: '', next_action_date: null })).toBeNull()
  })
})

describe('lost reasons', () => {
  it('is the same short list as the database trigger', () => {
    expect([...LOST_REASONS]).toEqual(['Price', 'Competitor won', 'Timing / budget', 'Scope mismatch', 'No response', 'Relationship', 'Other'])
    expect(isLostReason('Price')).toBe(true)
    expect(isLostReason('price')).toBe(false)
    expect(lostText('Price', ' Too dear ')).toBe('Price: Too dear')
  })
})

describe('noNextStep', () => {
  it('lists open deals with no next action or date, across the three pipelines', () => {
    const rows = noNextStep({
      users: [{ id: 'u1', name: 'Sara', email: 'sara@redreach.ae' }],
      accountNames: new Map([['a1', 'Clinic LLC'], ['a2', 'Trading House']]),
      crm: [
        { id: 'c1', company_name: 'Beta Co', owner: 'Sara', pipeline_stage: 'Lead', next_action: '', follow_up_date: null },
        { id: 'c2', company_name: 'Done Co', owner: 'Sara', pipeline_stage: 'Lost', next_action: '', follow_up_date: null },
        { id: 'c3', company_name: 'Fine Co', owner: '', pipeline_stage: 'Quoted', next_action: 'Call', follow_up_date: '2026-11-01' },
      ],
      salesDeals: [{ id: 's1', account_id: 'a1', stage: 'lead', owner_user_id: 'u1', next_action: 'Call', next_action_date: null }],
      ctrmDeals: [
        { id: 'd1', account_id: 'a2', stage: 'contacted', owner_user_id: null, next_action: '', next_action_date: '2026-11-01' },
        { id: 'd2', account_id: 'a2', stage: 'signed', owner_user_id: null, next_action: '', next_action_date: null },
      ],
    })
    expect(rows.map((r) => [r.key, r.missing, r.owner_label])).toEqual([
      ['crm:c1', 'No next action or date', 'Sara'],
      ['sales:s1', 'No date for the next action', 'Sara'],
      ['ctrm:d1', 'No next action', ''],
    ])
    expect(rows[0].owner_user_id).toBe('u1')
  })
})

describe('defaultNextActionDate', () => {
  it('is three working days on, skipping the weekend', () => {
    expect(defaultNextActionDate(new Date('2026-11-05T09:00:00'))).toBe('2026-11-10')
    expect(defaultNextActionDate(new Date('2026-11-02T09:00:00'))).toBe('2026-11-05')
  })
})

describe('crmMoveProblem', () => {
  const before = { pipeline_stage: 'Lead' }
  it('only checks when the stage changes', () => {
    expect(crmMoveProblem(before, { pipeline_stage: 'Lead', next_action: '', follow_up_date: null })).toBeNull()
    expect(crmMoveProblem(before, { pipeline_stage: 'Contacted', next_action: '', follow_up_date: null })).toBe(
      'Every open deal needs a next action',
    )
    expect(crmMoveProblem(before, { pipeline_stage: 'Contacted', next_action: 'Call', follow_up_date: '2026-11-03' })).toBeNull()
  })
  it('sends Lost to the stage menu where the reason is asked', () => {
    const lost = { pipeline_stage: 'Lost', next_action: '', follow_up_date: null }
    expect(crmMoveProblem(before, lost, { askedForReason: false })).toBe('Mark it Lost from the stage menu, so the reason is recorded')
    expect(crmMoveProblem(before, { ...lost, outcome_reason: 'Price', lost_note: 'Too dear' })).toBeNull()
    expect(crmMoveProblem(before, { ...lost, outcome_reason: 'Price' })).toBe('Add a note on why the deal was lost')
  })
})
