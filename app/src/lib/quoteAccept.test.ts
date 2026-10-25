import { describe, expect, it } from 'vitest'
import {
  acceptableStatus,
  acceptLink,
  acceptLinkExpiry,
  acceptLinkState,
  acceptProblem,
  acceptView,
  canHaveAcceptLink,
  canManageAcceptLinks,
  canSeeAcceptance,
  dealForQuote,
  draftContractFromAcceptedDeal,
  hashAcceptToken,
  isAcceptToken,
  newAcceptToken,
} from './quoteAccept'
import { pdfBase64FromDataUrl } from './quoteAcceptStore'
import type { SalesStage } from './types'

const now = new Date('2026-10-25T10:00:00Z')

describe('links', () => {
  it('makes random tokens and keeps only a hash', async () => {
    const t = newAcceptToken()
    expect(isAcceptToken(t)).toBe(true)
    expect(isAcceptToken('guess')).toBe(false)
    expect(await hashAcceptToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(acceptLink('https://x.io/RRCentral/', t)).toBe(`https://x.io/RRCentral/accept#${t}`)
  })

  it('runs until the quote expires, or 30 days', () => {
    expect(acceptLinkExpiry('2026-11-10', now)).toBe('2026-11-10T23:59:59.000Z')
    expect(acceptLinkExpiry('2026-10-01', now)).toBe('2026-11-24T10:00:00.000Z')
    expect(acceptLinkExpiry(null, now)).toBe('2026-11-24T10:00:00.000Z')
  })

  it('knows when a link is accepted, off or expired', () => {
    const base = { accepted_at: null, revoked_at: null, expires_at: '2026-11-01T00:00:00Z' }
    expect(acceptLinkState(base, now)).toBe('active')
    expect(acceptLinkState({ ...base, revoked_at: '2026-10-20T00:00:00Z' }, now)).toBe('revoked')
    expect(acceptLinkState({ ...base, expires_at: '2026-10-24T00:00:00Z' }, now)).toBe('expired')
    expect(acceptLinkState({ ...base, accepted_at: '2026-10-24T00:00:00Z', revoked_at: '2026-10-25T00:00:00Z' }, now)).toBe('accepted')
  })

  it('only finalised or sent quotes get links and can be accepted', () => {
    expect(canHaveAcceptLink({ status: 'Finalized', reference_number: 'RR-01-26001' })).toBe(true)
    expect(canHaveAcceptLink({ status: 'Draft', reference_number: '' })).toBe(false)
    expect(acceptableStatus('Sent')).toBe(true)
    expect(acceptableStatus('Superseded')).toBe(false)
  })
})

describe('acceptView', () => {
  const quote = {
    reference_number: 'RR-07-26001',
    client: 'Clinic LLC',
    division_code: '03',
    date: '2026-10-20',
    valid_until: '2026-11-19',
    amount: 4500,
    status: 'Sent',
    description: 'AI CRM Growth',
    quotation_currency: 'AED',
  }
  const link = { accepted_at: null, accepted_name: '', revoked_at: null, expires_at: '2026-11-19T23:59:59Z', has_pdf: true }

  it('shows the headline only', () => {
    const v = acceptView(quote, link, now)
    expect(v).toMatchObject({ state: 'active', reference: 'RR-07-26001', brand: 'RR Marketing', amount: 4500, hasPdf: true })
    expect(Object.keys(v)).not.toContain('supplier_cost_base')
  })

  it('closes a quote revised or lost in the app', () => {
    expect(acceptView({ ...quote, status: 'Superseded' }, link, now).state).toBe('closed')
  })
})

describe('acceptProblem', () => {
  const ok = { name: 'Sara Khan', date: '2026-10-25', agreed: true }
  it('needs a name, a recent date and the tick', () => {
    expect(acceptProblem(ok, now)).toBeNull()
    expect(acceptProblem({ ...ok, name: 'S' }, now)).toBe('Type your full name')
    expect(acceptProblem({ ...ok, date: '2026-10-26' }, now)).toMatch(/today/)
    expect(acceptProblem({ ...ok, date: '2026-09-01' }, now)).toMatch(/today/)
    expect(acceptProblem({ ...ok, agreed: false }, now)).toMatch(/Tick/)
  })
})

describe('the draft contract', () => {
  const deal = {
    id: 'd1',
    stage: 'quote_sent' as SalesStage,
    contract_id: null as string | null,
    quote_reference: 'RR-07-26001',
    package_id: 'p1',
    option: 'A' as const,
    monthly_fee: 4500,
    setup_fee: 0,
    discount_percent: 0,
    discount_months: 0,
    start_date: '2026-11-01',
  }

  it('is a draft that bills nothing', () => {
    const c = draftContractFromAcceptedDeal(deal, 'Sara Khan', now)
    expect(c.status).toBe('draft')
    expect(c.auto_invoice).toBe(false)
    expect(c.monthly_fee).toBe(4500)
    expect(c.notes).toMatch(/Accepted online by Sara Khan/)
  })

  it('belongs to the open deal with the quote reference', () => {
    const q = { reference_number: 'RR-07-26001-R1', base_reference: 'RR-07-26001' }
    expect(dealForQuote([deal], q)?.id).toBe('d1')
    expect(dealForQuote([{ ...deal, stage: 'lost' as SalesStage }], q)).toBeUndefined()
    expect(dealForQuote([{ ...deal, contract_id: 'c1' }], q)).toBeUndefined()
    expect(dealForQuote([deal], { reference_number: 'RR-01-26009', base_reference: '' })).toBeUndefined()
  })
})

describe('pdfBase64FromDataUrl', () => {
  it('takes the base64 part', () => {
    expect(pdfBase64FromDataUrl('data:application/pdf;filename=generated.pdf;base64,JVBERi0=')).toBe('JVBERi0=')
    expect(pdfBase64FromDataUrl('nonsense')).toBe('')
  })
})

describe('who does what', () => {
  it.each([
    ['admin', true, true],
    ['manager', true, false],
    ['sales', true, false],
    ['staff', false, false],
    ['viewer', false, false],
  ])('%s: makes links %s, sees the full record %s', (role, manage, see) => {
    expect(canManageAcceptLinks(role)).toBe(manage)
    expect(canSeeAcceptance(role)).toBe(see)
  })
})
