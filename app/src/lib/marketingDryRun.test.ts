import { describe, expect, it } from 'vitest'
import { dryRunEligible, dryRunResultStatus, summarizeDryRun } from './marketingDryRun'

describe('marketingDryRun', () => {
  it('counts queued emails only', () => {
    expect(dryRunEligible('queued')).toBe(true)
    expect(dryRunResultStatus()).toBe('dry_run_sent')
    expect(
      summarizeDryRun([
        { id: '1', status: 'queued', email: 'a@b.co' },
        { id: '2', status: 'skipped', email: 'c@d.co' },
        { id: '3', status: 'queued', email: '' },
      ]),
    ).toEqual({ sent: 1, skipped: 2 })
  })
})
