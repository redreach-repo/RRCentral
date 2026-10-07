import { describe, expect, it } from 'vitest'
import { enrichCalendarEvents, matchCrmToCalendarEvent } from './zohoCalendarMatch'
import type { CrmEntry } from './types'
import type { ZohoCalendarEvent } from './zoho'

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

const event = (partial: Partial<ZohoCalendarEvent> & Pick<ZohoCalendarEvent, 'uid' | 'title'>): ZohoCalendarEvent => ({
  startAt: '2026-03-15T10:00:00',
  endAt: '2026-03-15T10:30:00',
  isAllDay: false,
  organizer: 'alfred@redreach.ae',
  attendees: [],
  description: '',
  ...partial,
})

describe('zohoCalendarMatch', () => {
  it('matches by calendar_event_id', () => {
    const rows = [crm({ id: '1', company_name: 'Acme', calendar_event_id: 'abc123@zoho.com' })]
    expect(
      matchCrmToCalendarEvent(rows, { uid: 'abc123@zoho.com', title: 'Anything' })?.id,
    ).toBe('1')
  })

  it('matches follow-up title to company', () => {
    const rows = [crm({ id: '2', company_name: 'Gulf Stitch' })]
    expect(
      matchCrmToCalendarEvent(rows, { uid: 'x', title: 'Follow-up: Gulf Stitch' })?.id,
    ).toBe('2')
  })

  it('enriches events with CRM link', () => {
    const rows = [crm({ id: '3', company_name: 'Acme', calendar_event_id: 'uid1@zoho.com' })]
    const enriched = enrichCalendarEvents(
      [event({ uid: 'uid1@zoho.com', title: 'Follow-up: Acme' })],
      rows,
    )
    expect(enriched[0].crm?.id).toBe('3')
    expect(enriched[0].kind).toBe('follow_up')
  })
})
