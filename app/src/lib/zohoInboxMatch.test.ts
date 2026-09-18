import { describe, expect, it } from 'vitest'
import {
  attachCrmMatches,
  buildCrmEmailIndex,
  extractEmails,
  matchInboxMessageToCrm,
} from './zohoInboxMatch'
import type { CrmEntry } from './types'

function entry(partial: Partial<CrmEntry> & { id: string; company_name: string }): CrmEntry {
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

describe('zohoInboxMatch', () => {
  it('extracts emails from messy Zoho address strings', () => {
    expect(extractEmails('"Siju" <siju@thalassery.ae>')).toEqual(['siju@thalassery.ae'])
    expect(extractEmails('a@x.com, b@y.com')).toEqual(['a@x.com', 'b@y.com'])
  })

  it('matches inbox senders to CRM contacts', () => {
    const crm = [
      entry({
        id: '1',
        company_name: 'Thalassery Restaurant',
        contacts: [
          {
            id: 'c1',
            name: 'Siju',
            email: 'siju@thalassery.ae',
            phone: '',
            role: 'Primary',
          },
        ],
      }),
    ]
    const index = buildCrmEmailIndex(crm)
    expect(index.get('siju@thalassery.ae')?.companyName).toBe('Thalassery Restaurant')
    const hit = matchInboxMessageToCrm(
      { fromAddress: 'Siju <siju@thalassery.ae>', toAddress: '', sender: 'Siju' },
      index,
    )
    expect(hit?.crmId).toBe('1')
  })

  it('attaches CRM rows to inbox messages', () => {
    const rows = attachCrmMatches(
      [
        {
          messageId: 'm1',
          subject: 'Quote follow-up',
          fromAddress: 'siju@thalassery.ae',
          sender: 'Siju',
          summary: 'Can you revise?',
          receivedTime: Date.now(),
          status: 'unread',
          hasAttachment: false,
          folderId: '1',
        },
        {
          messageId: 'm2',
          subject: 'Spam',
          fromAddress: 'noreply@newsletter.test',
          sender: 'News',
          summary: '',
          receivedTime: Date.now(),
          status: 'read',
          hasAttachment: false,
          folderId: '1',
        },
      ],
      [
        entry({
          id: '1',
          company_name: 'Thalassery Restaurant',
          email_phone: 'siju@thalassery.ae',
        }),
      ],
    )
    expect(rows[0].crm?.companyName).toBe('Thalassery Restaurant')
    expect(rows[1].crm).toBeNull()
  })
})
