import { describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({ db: {} }))
vi.mock('../supabaseConfig', () => ({ getSupabaseClient: () => ({}) }))

import { dedupeHistory, likeText, linkTypeLabel, targetHref, type MailLink } from './mailLinks'

function link(p: Partial<MailLink>): MailLink {
  return {
    id: 'x',
    target_type: 'account',
    target_id: 't',
    mailbox_owner: 'sam@redreach.ae',
    message_id: '1',
    folder_id: '2',
    subject: '',
    from_address: '',
    to_address: '',
    sent_at: null,
    has_attachment: false,
    linked_by: 'sam@redreach.ae',
    created_at: '2026-11-20T10:00:00Z',
    ...p,
  }
}

describe('mail links', () => {
  it('shows each email once on a record, newest first', () => {
    const rows = dedupeHistory([
      link({ id: 'a', message_id: '1', sent_at: '2026-11-01T10:00:00Z' }),
      link({ id: 'b', message_id: '1', target_type: 'crm', sent_at: '2026-11-01T10:00:00Z' }),
      link({ id: 'c', message_id: '2', sent_at: '2026-11-05T10:00:00Z' }),
      link({ id: 'd', message_id: '1', mailbox_owner: 'ana@redreach.ae', sent_at: '2026-10-01T10:00:00Z' }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'd'])
  })

  it('keeps search wildcards out of the pattern', () => {
    expect(likeText(' 50%_off ')).toBe('%50\\%\\_off%')
  })

  it('opens the linked record', () => {
    expect(targetHref({ target_type: 'account', target_id: 'a1' })).toBe('/accounts/a1')
    expect(targetHref({ target_type: 'crm', target_id: 'c1' })).toBe('/crm?edit=c1')
    expect(targetHref({ target_type: 'quotation', target_id: 'q1' })).toBe('/document/quote/q1')
    expect(targetHref({ target_type: 'invoice', target_id: 'i1' })).toBe('/document/invoice/i1')
    expect(linkTypeLabel('crm')).toBe('CRM company')
    expect(linkTypeLabel('account')).toBe('Client')
  })
})
