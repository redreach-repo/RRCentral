import { describe, expect, it } from 'vitest'
import {
  isM365CalendarEnabled,
  isM365Connected,
  isM365MailEnabled,
} from './m365MailCalendarApi'

describe('m365MailCalendarApi flags', () => {
  it('treats m365Connected=yes as configured', () => {
    expect(isM365Connected({ m365Connected: 'yes' })).toBe(true)
    expect(isM365Connected({ m365Connected: 'no' })).toBe(false)
  })

  it('enables mail/calendar unless explicitly no when connected', () => {
    const connected = { m365Connected: 'yes' }
    expect(isM365MailEnabled(connected)).toBe(true)
    expect(isM365CalendarEnabled({ ...connected, m365CalendarEnabled: 'no' })).toBe(false)
  })
})
