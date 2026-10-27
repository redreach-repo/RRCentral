import { describe, expect, it } from 'vitest'
import { runSummary } from './hubspotSync'

const run = (over = {}) => ({
  companies_created: 0,
  companies_updated: 0,
  contacts_created: 0,
  contacts_updated: 0,
  deals_created: 0,
  deals_updated: 0,
  failed: 0,
  finished_at: '2026-10-27T02:00:00Z',
  ...over,
})

describe('runSummary', () => {
  it('says what was sent', () => {
    expect(runSummary(run({ companies_created: 2, contacts_created: 4, contacts_updated: 1, deals_updated: 1 }))).toBe(
      '2 companies, 5 contacts and 1 deal sent',
    )
    expect(runSummary(run({ companies_updated: 1 }))).toBe('1 company sent')
  })
  it('says when nothing changed, failures and runs still going', () => {
    expect(runSummary(run())).toBe('Nothing new to send')
    expect(runSummary(run({ deals_created: 3, failed: 1 }))).toBe('3 deals sent, 1 failed')
    expect(runSummary(run({ finished_at: null }))).toBe('Running…')
  })
})
