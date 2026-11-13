import { describe, expect, it } from 'vitest'
import {
  activeMailCalendarProviderLabel,
  getCalendarProvider,
  getMailProvider,
} from './index'

describe('mailCalendar façade', () => {
  it('returns the Zoho mail and calendar providers', () => {
    expect(getMailProvider().id).toBe('zoho')
    expect(getCalendarProvider().id).toBe('zoho')
    expect(getCalendarProvider().syncFollowUp).toBeTypeOf('function')
    expect(getCalendarProvider().deleteEvent).toBeTypeOf('function')
    expect(activeMailCalendarProviderLabel()).toBe('Zoho')
  })
})
