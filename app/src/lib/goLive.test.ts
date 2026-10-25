import { describe, expect, it } from 'vitest'
import { defaultGoLive, dueDaysProblem, goLiveDue, goLiveProgress, portalGoLive, signedDateFor } from './goLive'
import { DEFAULT_BUILD_TEMPLATES, planApply } from './buildTemplates'
import type { BuildTemplateItem } from './types'

const step = (over: Record<string, unknown>) => ({
  title: 'Step',
  stage: 'build' as const,
  sort: 1,
  done: false,
  done_at: null,
  kind: 'golive',
  owner: 'red_reach',
  due_date: null as string | null,
  ...over,
})

describe('default go live lists', () => {
  it('ends with Go live, later for bigger packages', () => {
    const last = (code: string) => defaultGoLive(code).at(-1)!
    expect(last('starter')).toMatchObject({ title: 'Go live', due_days: 21, owner: 'red_reach' })
    expect(last('growth').due_days).toBe(28)
    expect(last('done_for_you').due_days).toBe(35)
    expect(defaultGoLive('done_for_you').length).toBeGreaterThan(defaultGoLive('starter').length)
  })
  it('gives the client their own steps', () => {
    expect(defaultGoLive('starter').filter((s) => s.owner === 'client').length).toBeGreaterThanOrEqual(3)
  })
  it('is in every default template', () => {
    for (const t of DEFAULT_BUILD_TEMPLATES) expect(t.items.filter((i) => i.kind === 'golive').length).toBe(defaultGoLive(t.code).length)
  })
})

describe('signed date and due dates', () => {
  it('takes the latest signed deal, then the active contract start, then the contract date', () => {
    expect(
      signedDateFor({
        deals: [
          { stage: 'signed', signed_at: '2026-09-01T10:00:00Z' },
          { stage: 'signed', signed_at: '2026-10-05T10:00:00Z' },
          { stage: 'lost', signed_at: '2026-11-01T00:00:00Z' },
        ],
        contracts: [{ status: 'active', term_start: '2026-06-01', created_at: '2026-05-01T00:00:00Z' }],
      }),
    ).toBe('2026-10-05')
    expect(signedDateFor({ deals: [], contracts: [{ status: 'active', term_start: '2026-06-01', created_at: '2026-05-01T00:00:00Z' }] })).toBe('2026-06-01')
    expect(signedDateFor({ deals: [], contracts: [{ status: 'draft', term_start: null, created_at: '2026-05-02T00:00:00Z' }] })).toBe('2026-05-02')
    expect(signedDateFor({ deals: [{ stage: 'proposal', signed_at: null }], contracts: [{ status: 'ended', term_start: '2025-01-01', created_at: '' }] })).toBeNull()
  })
  it('counts the due date from signing', () => {
    expect(goLiveDue('2026-10-25', 21)).toBe('2026-11-15')
    expect(goLiveDue('2026-10-25', 0)).toBe('2026-10-25')
    expect(goLiveDue(null, 5)).toBeNull()
    expect(goLiveDue('2026-10-25', null)).toBeNull()
  })
  it('checks the days after signing', () => {
    expect(dueDaysProblem('')).toMatch(/Add/)
    expect(dueDaysProblem('2.5')).toMatch(/whole/)
    expect(dueDaysProblem('400')).toMatch(/365/)
    expect(dueDaysProblem('14')).toBeNull()
  })
})

describe('progress', () => {
  const tasks = [
    step({ title: 'Send logo', owner: 'client', due_date: '2026-10-20', sort: 1 }),
    step({ title: 'Training call', due_date: '2026-11-10', sort: 2 }),
    step({ title: 'Go live', due_date: '2026-11-15', sort: 3 }),
    step({ title: 'Kick-off', due_date: '2026-10-10', done: true, done_at: '2026-10-09T10:00:00Z', sort: 0 }),
    { ...step({ title: 'A build task' }), kind: 'task' },
  ]
  it('counts only go live steps and flags overdue ones', () => {
    const p = goLiveProgress(tasks, '2026-10-25')
    expect(p).toMatchObject({ done: 1, total: 4, percent: 25, overdue: 1, goLiveDate: '2026-11-15', live: false })
    expect(p.next).toEqual({ title: 'Send logo', owner: 'Client', due: '2026-10-20' })
  })
  it('shows the client their steps as "You", in due order', () => {
    const v = portalGoLive(tasks, '2026-10-25')!
    expect(v.steps.map((s) => s.title)).toEqual(['Kick-off', 'Send logo', 'Training call', 'Go live'])
    expect(v.steps[1]).toEqual({ title: 'Send logo', who: 'You', due: '20 Oct 2026', done: false, late: true })
    expect(v.goLiveDate).toBe('15 Nov 2026')
    expect(JSON.stringify(v)).not.toContain('owner')
  })
  it('has nothing to show without go live steps', () => {
    expect(portalGoLive([], '2026-10-25')).toBeNull()
  })
})

describe('applying go live steps', () => {
  const item = (over: Partial<BuildTemplateItem>): BuildTemplateItem => ({
    id: 'i',
    template_id: 't',
    kind: 'golive',
    stage: 'live',
    title: 'Go live',
    detail: '',
    est_hours: 0,
    sort: 1,
    owner: 'red_reach',
    due_days: 21,
    ...over,
  })
  it('copies go live steps with due dates from the signed date', () => {
    const plan = planApply([item({}), item({ id: 'j', title: 'Send logo', stage: 'discovery', owner: 'client', due_days: 3, sort: 2 })], [], [], '2026-10-25')
    expect(plan.tasks).toEqual([
      expect.objectContaining({ title: 'Send logo', kind: 'golive', owner: 'client', due_days: 3, due_date: '2026-10-28', est_hours: 0 }),
      expect.objectContaining({ title: 'Go live', kind: 'golive', owner: 'red_reach', due_date: '2026-11-15' }),
    ])
  })
  it('leaves due dates empty before signing and never doubles a step', () => {
    const plan = planApply([item({})], [], [], null)
    expect(plan.tasks[0].due_date).toBeNull()
    const again = planApply([item({})], [{ kind: 'golive', stage: 'live', title: 'Go live', sort: 1 }], [])
    expect(again.tasks).toEqual([])
    expect(again.skipped).toBe(1)
  })
  it('keeps a build task and a go live step with the same title apart', () => {
    const plan = planApply([item({ title: 'Training call with the client team' })], [{ stage: 'live', title: 'Training call with the client team', sort: 1 }], [])
    expect(plan.tasks).toHaveLength(1)
  })
})
