import { describe, expect, it } from 'vitest'
import {
  SHEET_COLUMNS,
  allowedActions,
  blocklistRows,
  filterStatuses,
  footerPreview,
  parseCsvCells,
  safeHttpUrl,
  sheetToRows,
  statusTone,
} from './outreach'

// Fictional companies and people only.
const HEADER = SHEET_COLUMNS.map((c) => c.header)

describe('parseCsvCells', () => {
  it('keeps line breaks and quotes inside quoted cells', () => {
    const csv = 'Company,Email,Body\r\n"Falcon Bay, FZE",layla@falconbay.example,"Hi Layla,\n\nShe said ""hello"".\nThanks"\nDune Metals,ravi@dune.example,Short\n'
    expect(parseCsvCells(csv)).toEqual([
      ['Company', 'Email', 'Body'],
      ['Falcon Bay, FZE', 'layla@falconbay.example', 'Hi Layla,\n\nShe said "hello".\nThanks'],
      ['Dune Metals', 'ravi@dune.example', 'Short'],
    ])
  })

  it('reads semicolon files and skips empty lines', () => {
    expect(parseCsvCells('﻿Company;Email\n\nA Co;a@a.example\n;\n')).toEqual([
      ['Company', 'Email'],
      ['A Co', 'a@a.example'],
    ])
  })
})

describe('sheetToRows', () => {
  it('maps every template column, in any order and spelling', () => {
    const cells = [
      ['Prospects for November'],
      ['EMAIL', 'company', 'Contact Name', 'Job title', 'Country', 'Signal used', 'Signal source URL', 'Subject', 'Body', 'Send from', 'Status', 'Checks before sending', 'Extra'],
      ['layla@falconbay.example', ' Falcon Bay Trading ', 'Layla Test', 'Head of Trading', 'UAE', 'Hiring', 'https://jobs.example/1', 'Hi', 'Line 1\r\nLine 2', 'alex@example-reach.test', 'Ready', 'Check LinkedIn', 'x'],
    ]
    const p = sheetToRows(cells)
    expect(p.error).toBe('')
    expect(p.missing).toEqual([])
    expect(p.ignored).toEqual(['Extra'])
    expect(p.rows).toEqual([
      {
        company: 'Falcon Bay Trading',
        contact_name: 'Layla Test',
        title: 'Head of Trading',
        email: 'layla@falconbay.example',
        country: 'UAE',
        signal_used: 'Hiring',
        signal_url: 'https://jobs.example/1',
        subject: 'Hi',
        body: 'Line 1\nLine 2',
        send_from: 'alex@example-reach.test',
        status: 'Ready',
        checks: 'Check LinkedIn',
      },
    ])
  })

  it('says what is missing and refuses a sheet with no header', () => {
    expect(sheetToRows([['Name', 'Phone'], ['A', '1']]).error).toMatch(/Company and Email/)
    const p = sheetToRows([['Company', 'Email'], ['A Co', '']])
    expect(p.missing).toContain('Subject')
    expect(p.rows).toHaveLength(1)
    expect(sheetToRows([HEADER]).error).toMatch(/no prospects/)
  })

  it('refuses more than 2,000 rows', () => {
    const cells = [HEADER, ...Array.from({ length: 2001 }, (_, i) => [`Co ${i}`, '', '', `p${i}@co${i}.example`])]
    expect(sheetToRows(cells).error).toMatch(/at most 2000/)
  })
})

describe('blocklistRows', () => {
  it('takes company and domain, or the email when there is no domain column', () => {
    expect(blocklistRows([['Company', 'Email'], ['North Co', 'a@north.example'], ['', '']])).toEqual([{ company: 'North Co', domain: 'a@north.example' }])
    expect(blocklistRows([['Company', 'Website'], ['South Co', 'https://south.example']])).toEqual([{ company: 'South Co', domain: 'https://south.example' }])
  })
})

describe('review rules shown on screen', () => {
  it('only offers Send to the person who approved a ready email', () => {
    expect(allowedActions({ status: 'ready', approved_by: 'u1' }, 'u1').send).toBe(true)
    expect(allowedActions({ status: 'ready', approved_by: 'u1' }, 'u2').send).toBe(false)
    expect(allowedActions({ status: 'ready', approved_by: 'u1' }, 'u2').approvedByOther).toBe(true)
    expect(allowedActions({ status: 'approved', approved_by: 'u1' }, 'u1').send).toBe(false)
    expect(allowedActions({ status: 'draft', approved_by: null }, 'u1').send).toBe(false)
    expect(allowedActions({ status: 'ready', approved_by: 'u1' }, null).send).toBe(false)
  })

  it('never offers edits or approval once an email is sent', () => {
    for (const status of ['sending', 'sent', 'replied', 'bounced', 'unsubscribed'] as const) {
      const a = allowedActions({ status, approved_by: 'u1' }, 'u1')
      expect([a.edit, a.approve, a.reject, a.pass, a.send]).toEqual([false, false, false, false, false])
    }
    expect(allowedActions({ status: 'awaiting_approval', approved_by: null }, 'u1').approve).toBe(true)
    expect(allowedActions({ status: 'rejected', approved_by: null }, 'u1').reopen).toBe(true)
  })

  it('filters and tones', () => {
    expect(filterStatuses('to_review')).toEqual(['draft', 'awaiting_approval'])
    expect(filterStatuses('all')).toBeNull()
    expect(statusTone('ready')).toBe('good')
    expect(statusTone('unsubscribed')).toBe('bad')
  })
})

describe('footerPreview', () => {
  it('shows the signature, company line and opt-out, and what is missing', () => {
    const s = { company_legal_name: 'Example Reach FZE', company_address: 'PO Box 0000\nExample City', opt_out_text: 'Opt out:' }
    const f = footerPreview('Alex Sender\nOn behalf of CTRM Next', s)
    expect(f.missing).toEqual([])
    expect(f.text).toContain('Example Reach FZE, PO Box 0000, Example City')
    expect(f.text).toContain('Opt out: [Unsubscribe link]')
    expect(footerPreview('', { ...s, company_address: '' }).missing).toEqual(['sender signature', 'postal address'])
    expect(footerPreview('x', null).missing).toEqual(['company legal name', 'postal address', 'opt-out line'])
  })
})

describe('safeHttpUrl', () => {
  it('links only web addresses', () => {
    expect(safeHttpUrl('https://news.example/a')).toBe('https://news.example/a')
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('not a url')).toBeNull()
  })
})
