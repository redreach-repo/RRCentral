import { describe, expect, it } from 'vitest'
import { attendanceLabel, defaultHoursForStatus } from './hrAttendance'

describe('hrAttendance', () => {
  it('defaults hours by status', () => {
    expect(defaultHoursForStatus('present')).toBe(8)
    expect(defaultHoursForStatus('half')).toBe(4)
    expect(defaultHoursForStatus('absent')).toBe(0)
    expect(attendanceLabel('present', 8)).toContain('8.0h')
  })
})
