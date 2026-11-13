import { describe, expect, it } from 'vitest'
import { getCalendarProvider, getMailProvider } from './index'

describe('mailCalendar façade', () => {
  it('returns the Zoho mail and calendar providers in slice 1', () => {
    expect(getMailProvider().id).toBe('zoho')
    expect(getCalendarProvider().id).toBe('zoho')
  })
})
