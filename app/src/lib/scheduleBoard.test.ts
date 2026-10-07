import { describe, expect, it } from 'vitest'
import { buildScheduleRows } from './scheduleBoard'
import type { CrmEntry } from './types'
import type { CalendarEventRow } from './zohoCalendarMatch'

function crm(partial: Partial<CrmEntry> & Pick<CrmEntry, 'id' | 'company_name'>): CrmEntry {
  return {
    primary_contact: '',
    email_phone: '',
    mobile_number: '',
    office_number: '',
    notes: '',
    follow_up_date: null,
    next_action: '',
    owner: '',
    company_owner: '',
    address: '',
    website: '',
    trn: '',
    pipeline_stage: 'Lead',
    quote_ref: '',
    outcome_reason: '',
    calendar_event_id: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('scheduleBoard', () => {
  it('merges follow-ups and calendar events, deduping linked follow-ups', () => {
    const future = new Date()
    future.setDate(future.getDate() + 3)
    const ymd = future.toISOString().slice(0, 10)

    const entries = [
      crm({
        id: '1',
        company_name: 'Acme',
        follow_up_date: ymd,
        next_action: 'Call',
        owner: 'Alfred',
        calendar_event_id: 'evt-1@zoho.com',
      }),
    ]
    const events: CalendarEventRow[] = [
      {
        uid: 'evt-1@zoho.com',
        title: 'Follow-up: Acme',
        startAt: `${ymd}T10:00:00`,
        endAt: `${ymd}T10:30:00`,
        isAllDay: false,
        organizer: 'info@redreach.ae',
        attendees: [],
        description: '',
        crm: entries[0],
        kind: 'follow_up',
      },
      {
        uid: 'meet-9',
        title: 'Team sync',
        startAt: `${ymd}T14:00:00`,
        endAt: `${ymd}T15:00:00`,
        isAllDay: false,
        organizer: 'alfred@redreach.ae',
        attendees: [{ email: 'jacob@redreach.ae' }],
        description: '',
        crm: null,
        kind: 'meeting',
      },
    ]

    const rows = buildScheduleRows({ crmEntries: entries, calendarEvents: events, daysAhead: 14 })
    expect(rows.map((r) => r.kind)).toEqual(['follow_up', 'meeting'])
    expect(rows.find((r) => r.kind === 'follow_up')?.title).toBe('Acme')
    expect(rows.find((r) => r.kind === 'meeting')?.title).toBe('Team sync')
  })
})
