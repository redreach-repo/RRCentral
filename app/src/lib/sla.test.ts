import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKING_CALENDAR,
  addWorkingHours,
  calendarFromSettings,
  slaHoursFor,
  slaState,
} from './sla'

// Dubai is UTC+4, so 09:00 local is 05:00Z and 18:00 local is 14:00Z.
const at = (iso: string) => new Date(iso)

describe('addWorkingHours', () => {
  it('stays inside the same working day when there is time left', () => {
    // Monday 27 Oct 2025, 10:00 Dubai + 4h = 14:00 Dubai
    expect(addWorkingHours(at('2025-10-27T06:00:00Z'), 4).toISOString()).toBe('2025-10-27T10:00:00.000Z')
  })

  it('carries a Friday afternoon ticket over the weekend to Monday', () => {
    // Friday 31 Oct 16:00 Dubai, 9 working hours: 2h Friday, 7h Monday -> Monday 16:00 Dubai
    expect(addWorkingHours(at('2025-10-31T12:00:00Z'), 9).toISOString()).toBe('2025-11-03T12:00:00.000Z')
  })

  it('starts the clock on Monday morning for a ticket raised on Saturday', () => {
    // Saturday 1 Nov 11:00 Dubai, 4h -> Monday 3 Nov 13:00 Dubai
    expect(addWorkingHours(at('2025-11-01T07:00:00Z'), 4).toISOString()).toBe('2025-11-03T09:00:00.000Z')
  })

  it('gives Starter (2 working days) from Thursday afternoon a Monday afternoon due time', () => {
    // Thursday 30 Oct 15:00 Dubai + 18h: 3h Thu, 9h Fri, 6h Mon -> Monday 15:00 Dubai
    expect(addWorkingHours(at('2025-10-30T11:00:00Z'), 18).toISOString()).toBe('2025-11-03T11:00:00.000Z')
  })

  it('moves an evening ticket to the next morning before counting', () => {
    // Tuesday 20:00 Dubai, 1h -> Wednesday 10:00 Dubai
    expect(addWorkingHours(at('2025-10-28T16:00:00Z'), 1).toISOString()).toBe('2025-10-29T06:00:00.000Z')
  })

  it('ends exactly at close of business when the hours fill the day', () => {
    expect(addWorkingHours(at('2025-10-27T05:00:00Z'), 9).toISOString()).toBe('2025-10-27T14:00:00.000Z')
  })

  it('follows a custom working week, e.g. Saturday to Thursday', () => {
    const cal = calendarFromSettings({ supportWorkingDays: '6,7,1,2,3,4' })
    // Friday 31 Oct 16:00 Dubai is off, so 2h counts from Saturday 09:00 -> 11:00 Dubai
    expect(addWorkingHours(at('2025-10-31T12:00:00Z'), 2, cal).toISOString()).toBe('2025-11-01T07:00:00.000Z')
  })
})

describe('calendarFromSettings', () => {
  it('falls back to Monday to Friday, 09:00 to 18:00', () => {
    expect(calendarFromSettings({})).toEqual(DEFAULT_WORKING_CALENDAR)
  })

  it('ignores a closing time before the opening time', () => {
    const cal = calendarFromSettings({ supportDayStart: '18:00', supportDayEnd: '09:00' })
    expect([cal.startMinute, cal.endMinute]).toEqual([540, 1080])
  })
})

describe('slaHoursFor', () => {
  const policies = [
    { applies_to: 'package' as const, package_id: 'growth', account_type: null, first_response_hours: 9 },
    { applies_to: 'account_type' as const, package_id: null, account_type: 'worship_church', first_response_hours: 18 },
    { applies_to: 'account_type' as const, package_id: null, account_type: 'ai_crm_client', first_response_hours: 12 },
  ]

  it('uses the package policy first', () => {
    expect(slaHoursFor('ai_crm_client', 'growth', policies)).toBe(9)
  })

  it('uses the account type policy for a church', () => {
    expect(slaHoursFor('worship_church', null, policies)).toBe(18)
  })

  it('falls back to 2 working days with no matching policy', () => {
    expect(slaHoursFor('ctrm_prospect', null, [])).toBe(18)
  })
})

describe('slaState', () => {
  const base = {
    created_at: '2025-10-27T05:00:00Z',
    sla_due_at: '2025-10-27T09:00:00Z',
    first_response_at: null,
    status: 'new',
  }

  it('is ok early in the window', () => {
    expect(slaState(base, at('2025-10-27T06:00:00Z'))).toBe('ok')
  })

  it('warns inside the last quarter of the window', () => {
    expect(slaState(base, at('2025-10-27T08:00:00Z'))).toBe('warning')
  })

  it('shows a breach after the due time', () => {
    expect(slaState(base, at('2025-10-27T09:01:00Z'))).toBe('breached')
  })

  it('records met or missed once someone replied', () => {
    expect(slaState({ ...base, first_response_at: '2025-10-27T08:30:00Z' }, at('2025-10-28T00:00:00Z'))).toBe('met')
    expect(slaState({ ...base, first_response_at: '2025-10-27T10:00:00Z' }, at('2025-10-28T00:00:00Z'))).toBe('missed')
  })
})
