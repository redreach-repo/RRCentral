import { describe, expect, it } from 'vitest'
import type { CrmEntry } from '../types'
import { counterpart, emailFrameDoc, hasRemoteImages, mailWhen, matchMailToCrm, prefixedSubject, startDraft, type MailListItem } from './mailInbox'

function crm(id: string, company_name: string, email_phone: string): CrmEntry {
  return {
    id,
    company_name,
    primary_contact: '',
    email_phone,
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
  } as CrmEntry
}

function msg(partial: Partial<MailListItem>): MailListItem {
  return {
    messageId: '1',
    folderId: '2',
    threadId: '',
    subject: 'Hi',
    fromAddress: '',
    sender: '',
    toAddress: '',
    summary: '',
    receivedTime: 0,
    unread: false,
    hasAttachment: false,
    ...partial,
  }
}

describe('mail page helpers', () => {
  it('shows the sender for received mail and the first recipient for sent mail', () => {
    const m = msg({ sender: 'Sam Lee', fromAddress: 'sam@x.com', toAddress: '"Ana Diaz" <ana@y.com>, bob@z.com' })
    expect(counterpart(m, false)).toBe('Sam Lee')
    expect(counterpart(m, true)).toBe('Ana Diaz')
    expect(counterpart(msg({ toAddress: 'bob@z.com' }), true)).toBe('bob@z.com')
    expect(counterpart(msg({}), true)).toBe('(no recipient)')
  })

  it('links an email to the CRM company by sender or recipient address', () => {
    const entries = [crm('c1', 'Mass Allied', 'ops@massallied.ae'), crm('c2', 'Other Co', 'hi@other.com')]
    const rows = matchMailToCrm(
      [
        msg({ messageId: 'a', fromAddress: 'OPS@massallied.ae' }),
        msg({ messageId: 'b', fromAddress: 'me@redreach.ae', toAddress: '"Hi" <hi@other.com>' }),
        msg({ messageId: 'c', fromAddress: 'nobody@nowhere.com' }),
      ],
      entries,
    )
    expect(rows.map((r) => r.crm?.companyName ?? null)).toEqual(['Mass Allied', 'Other Co', null])
  })

  it('formats times short', () => {
    const now = new Date('2026-11-20T15:00:00')
    expect(mailWhen(new Date('2026-11-20T09:05:00').getTime(), now)).toBe('09:05')
    expect(mailWhen(new Date('2026-03-02T09:05:00').getTime(), now)).toBe('2 Mar')
    expect(mailWhen(new Date('2025-03-02T09:05:00').getTime(), now)).toBe('2 Mar 2025')
    expect(mailWhen(0, now)).toBe('')
  })

  it('spots remote pictures', () => {
    expect(hasRemoteImages('<img src="https://t.co/p.gif">')).toBe(true)
    expect(hasRemoteImages('<div style="background:url(//x.com/a.png)">')).toBe(true)
    expect(hasRemoteImages('<img src="cid:logo">')).toBe(false)
  })

  it('locks the email frame down: no scripts, no forms, pictures only when asked', () => {
    const off = emailFrameDoc('<p>Hi</p>', { showImages: false })
    expect(off).toContain("default-src 'none'")
    expect(off).toContain("form-action 'none'")
    expect(off).toContain('img-src data: cid:;')
    expect(off).not.toContain('script-src')
    expect(off).toContain('<base target="_blank">')
    expect(off).toContain('<p>Hi</p>')
    const on = emailFrameDoc('<p>Hi</p>', { showImages: true })
    expect(on).toContain('img-src data: cid: https: http:')
  })
})

describe('reply, reply all and forward', () => {
  const msg = {
    fromAddress: '"Sara K" <sara@client.ae>',
    sender: 'Sara K',
    toAddress: 'me@redreach.ae, ops@redreach.ae',
    ccAddress: 'Sara@client.ae, boss@client.ae',
    subject: 'Quote for uniforms',
  }

  it('adds Re: or Fwd: once', () => {
    expect(prefixedSubject('Quote', 'Re')).toBe('Re: Quote')
    expect(prefixedSubject('RE: Quote', 'Re')).toBe('RE: Quote')
    expect(prefixedSubject('Fw: Quote', 'Fwd')).toBe('Fw: Quote')
    expect(prefixedSubject('(no subject)', 'Re')).toBe('Re:')
  })

  it('reply goes to the sender only', () => {
    const d = startDraft('reply', msg, ['me@redreach.ae'])
    expect(d).toMatchObject({ mode: 'reply', to: 'sara@client.ae', cc: '', subject: 'Re: Quote for uniforms', text: '' })
  })

  it('reply all adds everyone else, never yourself or the sender twice', () => {
    const d = startDraft('replyAll', msg, ['ME@redreach.ae'])
    expect(d.to).toBe('sara@client.ae')
    expect(d.cc).toBe('ops@redreach.ae, boss@client.ae')
  })

  it('answering your own sent email goes back to its recipients', () => {
    const d = startDraft('reply', { ...msg, fromAddress: 'me@redreach.ae', toAddress: 'sara@client.ae', ccAddress: '' }, ['me@redreach.ae'])
    expect(d.to).toBe('sara@client.ae')
  })

  it('forward starts empty with Fwd:, new starts blank', () => {
    expect(startDraft('forward', msg, [])).toMatchObject({ to: '', cc: '', subject: 'Fwd: Quote for uniforms' })
    expect(startDraft('new', msg, [])).toMatchObject({ mode: 'new', to: '', subject: '' })
  })
})
