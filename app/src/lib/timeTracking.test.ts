import { describe, expect, it } from 'vitest'
import {
  clearTimer,
  clientsWithoutHoursThisWeek,
  elapsedLabel,
  fridayReminderMessage,
  isHoursReminderDay,
  markFridayReminderSent,
  readTimer,
  saveTimer,
  shouldSendFridayReminder,
  timerHours,
  weekStartKey,
} from './timeTracking'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const start = '2026-10-23T09:00:00.000Z'
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000)

describe('timer', () => {
  it('rounds to the nearest quarter hour with a 15 minute minimum', () => {
    expect(timerHours(start, at(2))).toBe(0.25)
    expect(timerHours(start, at(22))).toBe(0.25)
    expect(timerHours(start, at(23))).toBe(0.5)
    expect(timerHours(start, at(70))).toBe(1.25)
    expect(timerHours(start, at(60 * 30))).toBe(24)
  })

  it('shows a clock label', () => {
    expect(elapsedLabel(start, at(65))).toBe('1:05')
    expect(elapsedLabel(start, at(0))).toBe('0:00')
  })

  it('keeps one timer per person in storage', () => {
    const s = memoryStorage()
    expect(readTimer('a@x.com', s)).toBeNull()
    saveTimer('A@x.com', { accountId: 'acc', accountName: 'Clinic', startedAt: start, category: 'support' }, s)
    expect(readTimer('a@x.com', s)?.accountName).toBe('Clinic')
    expect(readTimer('b@x.com', s)).toBeNull()
    clearTimer('a@x.com', s)
    expect(readTimer('a@x.com', s)).toBeNull()
  })

  it('ignores a broken stored timer', () => {
    const s = memoryStorage()
    s.setItem('rrcentral_timer:a@x.com', '{"accountId":"x","startedAt":"nope"}')
    expect(readTimer('a@x.com', s)).toBeNull()
  })
})

describe('Friday hours reminder', () => {
  const friday = new Date('2026-10-23T10:00:00')
  const accounts = [
    { id: 'a', name: 'Bravo Dental', type: 'ai_crm_client' as const },
    { id: 'b', name: 'Alpha Clinic', type: 'ai_crm_client' as const },
    { id: 'c', name: 'Logged Ltd', type: 'ai_crm_client' as const },
    { id: 'd', name: 'Ended Co', type: 'ai_crm_client' as const },
    { id: 'e', name: 'A Church', type: 'worship_church' as const },
  ]
  const contract = (account_id: string, extra: object = {}) => ({
    account_id,
    status: 'active' as const,
    term_start: '2026-01-01',
    term_end: '2026-12-31',
    ...extra,
  })
  const contracts = [contract('a'), contract('b'), contract('c'), contract('d', { term_end: '2026-09-30' }), contract('e')]

  it('lists running clients with no hours since Monday', () => {
    const entries = [
      { account_id: 'c', date: '2026-10-20' },
      { account_id: 'a', date: '2026-10-18' }, // last Sunday, a different week
    ]
    const list = clientsWithoutHoursThisWeek({ accounts, contracts, entries, today: friday })
    expect(list.map((a) => a.name)).toEqual(['Alpha Clinic', 'Bravo Dental'])
  })

  it('weeks start on Monday', () => {
    expect(weekStartKey(friday)).toBe('2026-10-19')
    expect(weekStartKey(new Date('2026-10-25T10:00:00'))).toBe('2026-10-19')
  })

  it('shows from Friday to Sunday only', () => {
    expect(isHoursReminderDay(friday)).toBe(true)
    expect(isHoursReminderDay(new Date('2026-10-25T10:00:00'))).toBe(true)
    expect(isHoursReminderDay(new Date('2026-10-22T10:00:00'))).toBe(false)
  })

  it('sends the desktop reminder once a week', () => {
    const s = memoryStorage()
    expect(shouldSendFridayReminder(new Date('2026-10-22T10:00:00'), s)).toBe(false)
    expect(shouldSendFridayReminder(friday, s)).toBe(true)
    markFridayReminderSent(friday, s)
    expect(shouldSendFridayReminder(new Date('2026-10-24T10:00:00'), s)).toBe(false)
    expect(shouldSendFridayReminder(new Date('2026-10-30T10:00:00'), s)).toBe(true)
  })

  it('writes a short message', () => {
    expect(fridayReminderMessage([])).toBe('')
    expect(fridayReminderMessage(['Alpha'])).toBe('1 client has no hours this week: Alpha. Log them before the week ends.')
    expect(fridayReminderMessage(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toContain('A, B, C, D, E and 2 more')
  })
})
