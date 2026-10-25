import { describe, expect, it } from 'vitest'
import { dealProblem, isOverdue, isStale, summaryText, weeklySummary } from './ctrm'

const now = new Date('2026-10-23T10:00:00Z')

describe('stale and overdue deals', () => {
  it('flags an open deal untouched for 14 days', () => {
    expect(isStale({ stage: 'contacted', last_touch_at: '2026-10-09T09:00:00Z' }, now)).toBe(true)
    expect(isStale({ stage: 'contacted', last_touch_at: '2026-10-10T09:00:00Z' }, now)).toBe(false)
  })

  it('never flags signed or lost deals', () => {
    expect(isStale({ stage: 'signed', last_touch_at: '2026-01-01T00:00:00Z' }, now)).toBe(false)
    expect(isOverdue({ stage: 'lost', next_action_date: '2026-01-01' }, now)).toBe(false)
  })

  it('flags a next action dated before today', () => {
    expect(isOverdue({ stage: 'evaluating', next_action_date: '2026-10-22' }, now)).toBe(true)
    expect(isOverdue({ stage: 'evaluating', next_action_date: '2026-10-23' }, now)).toBe(false)
  })
})

describe('dealProblem', () => {
  it('needs a reason to mark a deal lost', () => {
    expect(dealProblem({ stage: 'lost', lost_reason: ' ', next_action: '', next_action_date: null })).toMatch(/lost/)
    expect(dealProblem({ stage: 'lost', lost_reason: 'Budget', next_action: '', next_action_date: null })).toBe('Pick why the deal was lost')
    expect(
      dealProblem({ stage: 'lost', lost_reason_code: 'Timing / budget', lost_reason: ' ', next_action: '', next_action_date: null }),
    ).toBe('Add a note on why the deal was lost')
    expect(
      dealProblem({ stage: 'lost', lost_reason_code: 'Timing / budget', lost_reason: 'Budget', next_action: '', next_action_date: null }),
    ).toBeNull()
  })

  it('needs a next action and date on open deals', () => {
    expect(dealProblem({ stage: 'contacted', lost_reason: '', next_action: '', next_action_date: '2026-11-01' })).toMatch(/next action/)
    expect(dealProblem({ stage: 'contacted', lost_reason: '', next_action: 'Call', next_action_date: null })).toMatch(/date/)
    expect(dealProblem({ stage: 'signed', lost_reason: '', next_action: '', next_action_date: null })).toBeNull()
  })
})

describe('weeklySummary', () => {
  const deals = [
    { id: 'a', stage: 'intro_call_booked' as const, region: 'india' as const, created_at: '2026-10-20T08:00:00Z', next_action: 'Hold the call', next_action_date: '2026-10-27' },
    { id: 'b', stage: 'demo_done' as const, region: 'middle_east' as const, created_at: '2026-09-01T08:00:00Z', next_action: 'Send proposal', next_action_date: '2026-10-26' },
    { id: 'c', stage: 'lost' as const, region: 'middle_east' as const, created_at: '2026-08-01T08:00:00Z', next_action: '', next_action_date: null },
  ]
  const changes = [
    { deal_id: 'a', to_stage: 'intro_call_booked' as const, changed_at: '2026-10-21T08:00:00Z' },
    { deal_id: 'b', to_stage: 'demo_done' as const, changed_at: '2026-10-22T08:00:00Z' },
    { deal_id: 'b', to_stage: 'evaluating' as const, changed_at: '2026-10-12T08:00:00Z' },
  ]
  const names: Record<string, string> = { a: 'Mumbai Metals', b: 'Gulf Energy', c: 'Old Lead' }
  const s = weeklySummary(deals, changes, (id) => names[id], now)

  it('covers Monday to Sunday of the given week', () => {
    expect([s.weekStart, s.weekEnd]).toEqual(['2026-10-19', '2026-10-25'])
  })

  it('counts deals by stage and lists this week\'s moves', () => {
    expect(s.byStage.find((b) => b.stage === 'lost')?.count).toBe(1)
    expect(s.newThisWeek.map((n) => n.name)).toEqual(['Mumbai Metals'])
    expect(s.callsBooked).toEqual(['Mumbai Metals'])
    expect(s.demosDone).toEqual(['Gulf Energy'])
  })

  it('lists next steps for open deals, soonest first', () => {
    expect(s.nextSteps.map((n) => n.name)).toEqual(['Gulf Energy', 'Mumbai Metals'])
  })

  it('carries no commission or fee figures', () => {
    const text = summaryText(s)
    expect(JSON.stringify(s)).not.toMatch(/commission|fee|AED/i)
    expect(text).not.toMatch(/commission|fee|AED/i)
    expect(text).toContain('Intro calls booked: Mumbai Metals')
  })
})
