import { describe, expect, it } from 'vitest'
import { coveredTopics, followUpsDue, leftToCover, notStarted, sessionProblem, sessionTimelineText, type SessionDraft } from './ctrmSessions'

const draft = (over: Partial<SessionDraft> = {}): SessionDraft => ({
  kind: 'training',
  session_date: '2026-10-20',
  attendees: 'Sam, Priya',
  topics_covered: ['Trade capture'],
  topics_left: ['Credit'],
  recording_url: '',
  follow_up_due: '2026-10-23',
  notes: '',
  ...over,
})
const s = (session_date: string, covered: string[], left: string[], created_at = `${session_date}T10:00:00Z`) => ({
  session_date,
  created_at,
  topics_covered: covered,
  topics_left: left,
})

describe('sessionProblem', () => {
  it('accepts a good session', () => expect(sessionProblem(draft())).toBeNull())
  it('needs a date, a real link and a sensible follow up', () => {
    expect(sessionProblem(draft({ session_date: '' }))).toMatch(/date/)
    expect(sessionProblem(draft({ recording_url: 'teams meeting' }))).toMatch(/https/)
    expect(sessionProblem(draft({ recording_url: 'https://example.com/rec/1' }))).toBeNull()
    expect(sessionProblem(draft({ follow_up_due: '2026-10-19' }))).toMatch(/before/)
  })
  it('refuses a topic both covered and left', () => {
    expect(sessionProblem(draft({ topics_left: ['Trade capture'] }))).toMatch(/both covered and left/)
  })
})

describe('left to cover', () => {
  const sessions = [
    s('2026-10-01', ['Platform overview'], ['Trade capture', 'Credit']),
    s('2026-10-08', ['Trade capture'], ['Reporting']),
    s('2026-10-15', [], ['Platform overview']),
  ]
  it('uses the latest mention of each topic', () => {
    expect(leftToCover(sessions).sort()).toEqual(['Credit', 'Platform overview', 'Reporting'])
    expect(coveredTopics(sessions).sort()).toEqual(['Platform overview', 'Trade capture'])
  })
  it('lists topics nobody has touched yet', () => {
    expect(notStarted(sessions, ['Platform overview', 'Inventory', 'Credit', 'Users and permissions'])).toEqual(['Inventory', 'Users and permissions'])
  })
  it('orders sessions on the same day by when they were logged', () => {
    expect(leftToCover([s('2026-10-01', ['Credit'], [], '2026-10-01T12:00:00Z'), s('2026-10-01', [], ['Credit'], '2026-10-01T09:00:00Z')])).toEqual([])
  })
})

describe('follow ups', () => {
  it('lists the ones due today or earlier and not done, soonest first', () => {
    const rows = [
      { id: 'a', follow_up_due: '2026-10-25', follow_up_done: false },
      { id: 'b', follow_up_due: '2026-10-20', follow_up_done: false },
      { id: 'c', follow_up_due: '2026-10-21', follow_up_done: true },
      { id: 'd', follow_up_due: '2026-10-26', follow_up_done: false },
      { id: 'e', follow_up_due: null, follow_up_done: false },
    ]
    expect(followUpsDue(rows, '2026-10-25').map((r) => r.id)).toEqual(['b', 'a'])
  })
  it('writes the timeline line', () => {
    expect(sessionTimelineText(draft())).toBe('Training on 2026-10-20. Covered: Trade capture. Left: Credit.')
  })
})
