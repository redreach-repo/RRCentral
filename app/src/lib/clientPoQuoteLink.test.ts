import { describe, expect, it } from 'vitest'
import {
  awardsOnLink,
  canLinkPoToQuote,
  daysAfterValidity,
  invoicePoNote,
  lateNote,
  linkAdvice,
  poQuoteSummary,
  posByQuote,
  quoteLinkCandidates,
  sameClientName,
  shortDate,
} from './clientPoQuoteLink'

const q = (over: Partial<Parameters<typeof quoteLinkCandidates>[0][number]>) => ({
  id: 'q',
  client: 'Green Cement LLC',
  reference_number: 'RR-01-26008',
  status: 'Sent',
  date: '2026-11-01',
  valid_until: '2026-11-15',
  ...over,
})

describe('client PO to quote link', () => {
  it('links Expired, Awarded and Superseded quotes, never Drafts or archived ones', () => {
    expect(canLinkPoToQuote({ status: 'Expired' })).toBe(true)
    expect(canLinkPoToQuote({ status: 'Superseded' })).toBe(true)
    expect(canLinkPoToQuote({ status: 'Awarded' })).toBe(true)
    expect(canLinkPoToQuote({ status: 'Draft' })).toBe(false)
    expect(canLinkPoToQuote({ status: 'Sent', deleted_at: '2026-11-20T00:00:00Z' })).toBe(false)
  })

  it('awards Expired and Not awarded quotes straight away, but not Superseded ones', () => {
    expect(awardsOnLink('Expired')).toBe(true)
    expect(awardsOnLink('Not awarded')).toBe(true)
    expect(awardsOnLink('Sent')).toBe(true)
    expect(awardsOnLink('Superseded')).toBe(false)
    expect(awardsOnLink('Awarded')).toBe(false)
  })

  it('matches client names ignoring LLC, case and punctuation', () => {
    expect(sameClientName('Green Cement L.L.C.', 'green cement llc')).toBe(true)
    expect(sameClientName('Green Cement', 'Sharjah Ready Mix')).toBe(false)
    expect(sameClientName('', '')).toBe(false)
  })

  it("offers the client's quotes first, newest first, without drafts", () => {
    const list = [
      q({ id: 'old', date: '2026-10-01', status: 'Expired' }),
      q({ id: 'new', date: '2026-11-10' }),
      q({ id: 'draft', status: 'Draft' }),
      q({ id: 'other', client: 'Someone Else', date: '2026-11-20' }),
    ]
    expect(quoteLinkCandidates(list, 'Green Cement').map((x) => x.id)).toEqual(['new', 'old'])
    expect(quoteLinkCandidates(list, 'Green Cement', true).map((x) => x.id)).toEqual(['new', 'old', 'other'])
    expect(quoteLinkCandidates(list, 'Nobody').map((x) => x.id)).toEqual(['other', 'new', 'old'])
  })

  it('counts the days a PO came after the validity date', () => {
    expect(daysAfterValidity('2026-11-26', '2026-11-20')).toBe(6)
    expect(daysAfterValidity('2026-11-20', '2026-11-20')).toBe(0)
    expect(daysAfterValidity('2026-11-10', '2026-11-20')).toBe(0)
    expect(daysAfterValidity(null, '2026-11-20')).toBe(0)
    expect(lateNote('2026-11-21', '2026-11-20')).toBe("came 1 day after the quote's validity (20 Nov 2026)")
    expect(shortDate('2026-01-05')).toBe('5 Jan 2026')
  })

  it('summarises the link for lists', () => {
    expect(poQuoteSummary({})).toBe('')
    expect(poQuoteSummary({ quotation_id: 'x', quote_reference: 'RR-01-26100', issued_on: '2026-11-25', quote_valid_until: '2026-12-01' })).toBe(
      'Quote RR-01-26100',
    )
    expect(poQuoteSummary({ quotation_id: 'x', quote_reference: 'RR-01-26100', issued_on: '2026-11-26', quote_valid_until: '2026-11-20' })).toBe(
      "Quote RR-01-26100 · PO came 6 days after the quote's validity (20 Nov 2026)",
    )
  })

  it('warns before linking: late PO, superseded quote, other client', () => {
    const advice = linkAdvice({
      quote: q({ status: 'Superseded', client: 'Someone Else', valid_until: '2026-11-15' }),
      poIssuedOn: '2026-11-18',
      poClientName: 'Green Cement',
    })
    expect(advice).toHaveLength(3)
    expect(advice[0]).toMatch(/came 3 days after/)
    expect(advice[0]).toMatch(/no revision or extension is needed/)
    expect(advice[1]).toMatch(/superseded/)
    expect(advice[2]).toMatch(/Someone Else/)
    expect(linkAdvice({ quote: q({}), poIssuedOn: '2026-11-10', poClientName: 'Green Cement LLC' })).toEqual([])
  })

  it('lists PO numbers per quote and writes the invoice note', () => {
    const map = posByQuote([
      { quotation_id: 'a', po_number: '4200050362' },
      { quotation_id: 'a', po_number: '4200050400' },
      { quotation_id: 'a', po_number: '4200050362' },
      { quotation_id: null, po_number: 'X' },
    ])
    expect(map.get('a')).toEqual(['4200050362', '4200050400'])
    expect(map.size).toBe(1)
    expect(invoicePoNote(['4200050362', ' '])).toBe('Client PO No.: 4200050362')
    expect(invoicePoNote([])).toBe('')
  })
})
