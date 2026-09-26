import { describe, expect, it } from 'vitest'
import { markNotifiedToday, reminderCounts, reminderMessage, shouldNotifyToday } from './followUpReminders'
import type { CrmEntry } from './types'

function deal(id: string, follow_up_date: string | null, owner = '', pipeline_stage = 'Lead'): CrmEntry {
  return { id, company_name: id, follow_up_date, owner, pipeline_stage } as CrmEntry
}

describe('followUpReminders', () => {
  const today = new Date('2026-09-26T09:00:00')

  it('counts overdue and due-today on open deals only', () => {
    const counts = reminderCounts(
      [
        deal('a', '2026-09-20', 'Ram'),
        deal('b', '2026-09-26', 'Jacob'),
        deal('c', '2026-09-26', 'Ram'),
        deal('d', '2026-09-30', 'Ram'),
        deal('won', '2026-09-01', 'Ram', 'Won'),
        deal('none', null, 'Ram'),
      ],
      'Ram',
      today,
    )
    expect(counts).toEqual({ overdue: 1, today: 2, mine: 2 })
  })

  it('builds a short message, empty when nothing is due', () => {
    expect(reminderMessage({ overdue: 2, today: 1, mine: 0 })).toBe('Follow-ups: 2 overdue, 1 due today')
    expect(reminderMessage({ overdue: 0, today: 0, mine: 0 })).toBe('')
  })

  it('notifies at most once per day', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    expect(shouldNotifyToday(today, storage)).toBe(true)
    markNotifiedToday(today, storage)
    expect(shouldNotifyToday(today, storage)).toBe(false)
    expect(shouldNotifyToday(new Date('2026-09-27T09:00:00'), storage)).toBe(true)
  })
})
