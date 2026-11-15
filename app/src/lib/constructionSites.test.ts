import { describe, expect, it } from 'vitest'
import { assignmentWindow, siteLabel } from './constructionSites'

describe('constructionSites', () => {
  it('formats labels', () => {
    expect(siteLabel('S1', 'Tower A')).toBe('S1 · Tower A')
    expect(assignmentWindow('2026-01-01', '2026-06-01')).toContain('→')
    expect(assignmentWindow(null, null)).toBe('open-ended')
  })
})
