import { describe, expect, it } from 'vitest'
import {
  computeDueCounts,
  crmSearchHaystack,
  followUpBucket,
  matchesFollowFilter,
  resolveSalesOwnerName,
  sortByFollowUpUrgency,
} from './crmWorkQueue'
import type { CrmEntry } from './types'

function entry(partial: Partial<CrmEntry>): CrmEntry {
  return {
    id: partial.id || '1',
    company_name: partial.company_name || 'Acme',
    primary_contact: '',
    email_phone: '',
    mobile_number: '',
    office_number: '',
    notes: partial.notes || '',
    follow_up_date: partial.follow_up_date ?? null,
    next_action: partial.next_action || '',
    owner: partial.owner || '',
    company_owner: '',
    address: '',
    website: '',
    trn: '',
    pipeline_stage: partial.pipeline_stage || 'Lead',
    quote_ref: '',
    outcome_reason: '',
    calendar_event_id: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
  }
}

describe('crmWorkQueue', () => {
  it('resolves sales owner name from app users', () => {
    expect(
      resolveSalesOwnerName('ram@redreach.ae', [
        { email: 'ram@redreach.ae', name: 'Ramshad' },
        { email: 'other@redreach.ae', name: 'Other' },
      ]),
    ).toBe('Ramshad')
    expect(resolveSalesOwnerName('solo@redreach.ae', [])).toBe('solo@redreach.ae')
  })

  it('classifies follow-up buckets and Due filter', () => {
    const today = new Date('2026-09-18T12:00:00')
    expect(followUpBucket('2026-09-17', today)).toBe('Overdue')
    expect(followUpBucket('2026-09-18', today)).toBe('Today')
    expect(followUpBucket('2026-09-20', today)).toBe('Upcoming')
    expect(followUpBucket(null, today)).toBe('None')
    expect(matchesFollowFilter(entry({ follow_up_date: '2026-09-17' }), 'Due', today)).toBe(true)
    expect(matchesFollowFilter(entry({ follow_up_date: '2026-09-20' }), 'Due', today)).toBe(false)
  })

  it('counts due buckets and sorts by urgency', () => {
    const rows = [
      entry({ id: 'u', company_name: 'Up', follow_up_date: '2026-09-25', owner: 'Me' }),
      entry({ id: 'o', company_name: 'Over', follow_up_date: '2026-09-10', owner: 'Me' }),
      entry({ id: 't', company_name: 'Today', follow_up_date: '2026-09-18', owner: 'Other' }),
      entry({ id: 'n', company_name: 'None', follow_up_date: null, owner: 'Me' }),
    ]
    const counts = computeDueCounts(rows, 'Me', new Date('2026-09-18T12:00:00'))
    expect(counts).toEqual({ overdue: 1, today: 1, upcoming: 1, none: 1, mine: 3 })
    expect(sortByFollowUpUrgency(rows[0], rows[1])).toBeGreaterThan(0)
    expect([...rows].sort(sortByFollowUpUrgency).map((r) => r.id)).toEqual(['o', 't', 'u', 'n'])
  })

  it('builds searchable haystack including notes and owner', () => {
    const hay = crmSearchHaystack(
      entry({ notes: 'Needs samples', owner: 'Ramshad', next_action: 'Call' }),
    )
    expect(hay).toContain('needs samples')
    expect(hay).toContain('ramshad')
    expect(hay).toContain('call')
  })
})
