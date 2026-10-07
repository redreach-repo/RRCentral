import { describe, expect, it } from 'vitest'
import { formatZohoRange } from './zoho'

describe('formatZohoRange', () => {
  it('uses date-only yyyyMMdd like Zoho docs', () => {
    expect(formatZohoRange(new Date(2026, 2, 15), new Date(2026, 2, 22))).toBe(
      '{"start":"20260315","end":"20260322"}',
    )
  })
})
