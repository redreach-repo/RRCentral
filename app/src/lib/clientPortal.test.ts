import { describe, expect, it } from 'vitest'
import {
  buildPortalView,
  hashPortalToken,
  isPortalToken,
  newPortalToken,
  portalAccessState,
  portalInvoices,
  portalLink,
  portalMessageProblem,
  portalQuotes,
  portalUploadProblem,
  base64Bytes,
  safeUploadName,
  sizeLabel,
  uploadContentType,
  type PortalInput,
  type PortalQuoteRow,
} from './clientPortal'
import { DEFAULT_DELIVERY_RATES } from './delivery'
import type { BuildStage, Contract, DeliveryPackage } from './types'

const now = new Date('2026-10-23T08:00:00Z')

const pkg: DeliveryPackage = {
  id: 'p2',
  code: 'growth',
  name: 'Growth',
  monthly_fee_a: 4500,
  setup_fee_b: 3000,
  monthly_fee_b: 4200,
  target_hours: 10,
  build_hours_target: 40,
  included_whatsapp: 1000,
  support_response: '1 working day',
  support_response_days: 1,
  ai_cap_usd: 50,
  included_lead_credits_usd: 0,
  tool_cost_aed: 0,
  sort: 2,
  active: true,
  updated_at: '',
}

const contract = {
  id: 'c1',
  account_id: 'a1',
  package_id: 'p2',
  status: 'active',
  term_start: '2026-06-01',
  term_end: '2027-05-31',
  monthly_fee: 4500,
  created_at: '2026-05-20T00:00:00Z',
} as Contract

function stage(s: BuildStage['stage'], status: BuildStage['status']): BuildStage {
  return { id: s, account_id: 'a1', stage: s, status, owner_user_id: null, due_date: null, blocker_note: '', completed_at: null, created_at: '' }
}

function input(over: Partial<PortalInput> = {}): PortalInput {
  return {
    now,
    companyName: 'Red Reach Middle East FZE',
    account: { name: 'Bright Smile Dental', reference: 'AC-07-26004' },
    contracts: [contract],
    packages: [pkg],
    stages: [stage('discovery', 'done'), stage('requirements_signed_off', 'done'), stage('build', 'in_progress')],
    requirements: [
      { title: 'Booking reminders', status: 'agreed', is_change_request: false },
      { title: 'Old idea', status: 'built', is_change_request: false },
      { title: 'Arabic replies', status: 'open', is_change_request: true },
    ],
    tickets: [
      { subject: 'Bot not replying', status: 'open', created_at: '2026-10-22T06:00:00Z', sla_due_at: '2026-10-22T10:00:00Z', first_response_at: null, resolved_at: null },
      { subject: 'Add a FAQ', status: 'waiting_on_client', created_at: '2026-10-21T06:00:00Z', sla_due_at: '2026-10-22T06:00:00Z', first_response_at: '2026-10-21T08:00:00Z', resolved_at: null },
      { subject: 'Fix logo', status: 'resolved', created_at: '2026-10-02T06:00:00Z', sla_due_at: '2026-10-03T06:00:00Z', first_response_at: '2026-10-02T09:00:00Z', resolved_at: '2026-10-05T10:00:00Z' },
      { subject: 'Old one', status: 'closed', created_at: '2026-03-02T06:00:00Z', sla_due_at: null, first_response_at: null, resolved_at: '2026-03-05T10:00:00Z' },
    ],
    usage: [
      { id: 'u1', account_id: 'a1', month: '2026-10-01', whatsapp_marketing_count: 700, whatsapp_service_count: 500, ai_cost_usd: 20, lead_credits_cost_usd: 0, updated_at: '' },
      { id: 'u2', account_id: 'a1', month: '2026-09-01', whatsapp_marketing_count: 300, whatsapp_service_count: 200, ai_cost_usd: 12.5, lead_credits_cost_usd: 0, updated_at: '' },
    ],
    entries: [
      { date: '2026-10-03', hours: 4, category: 'build' },
      { date: '2026-10-10', hours: 1.5, category: 'support' },
      { date: '2026-09-10', hours: 6, category: 'build' },
    ],
    rates: DEFAULT_DELIVERY_RATES,
    ...over,
  }
}

describe('portal tokens', () => {
  it('makes random URL safe tokens and hashes them', async () => {
    const a = newPortalToken()
    const b = newPortalToken()
    expect(a).not.toBe(b)
    expect(isPortalToken(a)).toBe(true)
    expect(isPortalToken('short')).toBe(false)
    expect(isPortalToken(`${a.slice(0, 42)}!`)).toBe(false)
    const hash = await hashPortalToken(a)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashPortalToken(a)).toBe(hash)
  })

  it('puts the token after # in the link', () => {
    expect(portalLink('https://redreach-repo.github.io/RRCentral/', 'abc')).toBe('https://redreach-repo.github.io/RRCentral/portal#abc')
  })

  it('knows revoked and expired links', () => {
    expect(portalAccessState({ expires_at: '2027-10-23T00:00:00Z', revoked_at: null }, now)).toBe('active')
    expect(portalAccessState({ expires_at: '2026-10-01T00:00:00Z', revoked_at: null }, now)).toBe('expired')
    expect(portalAccessState({ expires_at: null, revoked_at: '2026-10-01T00:00:00Z' }, now)).toBe('revoked')
  })
})

describe('buildPortalView', () => {
  it('shows the plan and build progress', () => {
    const v = buildPortalView(input())
    expect(v.plan).toMatchObject({ packageName: 'Growth', targetHours: 10, includedWhatsapp: 1000, termEnd: '2027-05-31' })
    expect(v.build).toMatchObject({ done: 2, total: 6, current: 'Build', live: false })
    expect(v.build.stages[2]).toEqual({ label: 'Build', status: 'In progress', due: null })
    expect(v.build.stages[5]).toEqual({ label: 'Live', status: 'Not started', due: null })
  })

  it('lists open tickets with a plain status, newest first', () => {
    const v = buildPortalView(input())
    expect(v.openTickets).toEqual([
      { id: '', subject: 'Bot not replying', status: 'Open', opened: '22 Oct 2026', note: 'Reply overdue, we are on it', late: true },
      { id: '', subject: 'Add a FAQ', status: 'Waiting on client', opened: '21 Oct 2026', note: 'We have replied', late: false },
    ])
    expect(v.recentlyResolved).toEqual([{ subject: 'Fix logo', resolved: '5 Oct 2026' }])
  })

  it('shows usage against the plan for this month and last', () => {
    const v = buildPortalView(input())
    expect(v.usage.map((u) => u.month)).toEqual(['2026-10-01', '2026-09-01'])
    expect(v.usage[0]).toMatchObject({ whatsappUsed: 1200, whatsappIncluded: 1000, whatsappPercent: 120, aiUsd: 20, aiCapUsd: 50 })
    expect(v.usage[0].aboveAed).toBeGreaterThan(0)
    expect(v.usage[1]).toMatchObject({ whatsappUsed: 500, whatsappPercent: 50, aboveAed: 0 })
  })

  it('builds the monthly report for the chosen month', () => {
    const v = buildPortalView(input({ month: '2026-10-01' }))
    expect(v.report).toMatchObject({
      label: 'October 2026',
      hours: 5.5,
      targetHours: 10,
      ticketsOpened: 3,
      answered: 1,
      answeredOnTime: 1,
      nextMonthLabel: 'November 2026',
    })
    expect(v.report.hoursByWork).toEqual([
      { label: 'Build', hours: 4 },
      { label: 'Support', hours: 1.5 },
    ])
    expect(v.report.comingNext).toEqual(['Move the build forward: Build', 'Booking reminders', 'Arabic replies (change request)'])
    expect(buildPortalView(input({ month: '2026-09-01' })).report.hours).toBe(6)
  })

  it('only offers the last six months', () => {
    const v = buildPortalView(input({ month: '2025-01-01' }))
    expect(v.report.month).toBe('2026-10-01')
    expect(v.reportMonths).toHaveLength(6)
    expect(v.reportMonths.at(-1)?.month).toBe('2026-05-01')
  })

  it('works before a contract exists', () => {
    const v = buildPortalView(input({ contracts: [], stages: [] }))
    expect(v.plan).toBeNull()
    expect(v.usage[0]).toMatchObject({ whatsappIncluded: 0, whatsappPercent: null, aboveAed: 0 })
    expect(v.build.done).toBe(0)
  })

  it('never carries internal fields', () => {
    const text = JSON.stringify(buildPortalView(input()))
    for (const word of ['monthly_fee', 'tool_cost', 'internal', 'owner', 'account_id', 'notes']) {
      expect(text).not.toContain(word)
    }
  })
})

describe('portal quotes', () => {
  const link = { expires_at: '2026-11-30T00:00:00Z', revoked_at: null, accepted_at: null, accepted_name: '', has_pdf: true }
  const q = (over: Partial<PortalQuoteRow>): PortalQuoteRow => ({
    id: 'q1',
    reference_number: 'RR-07-26010',
    date: '2026-10-20',
    valid_until: '2026-11-19',
    amount: 4500,
    status: 'Sent',
    links: [link],
    ...over,
  })
  it('shows a sent quote with a working link as waiting', () => {
    expect(portalQuotes([q({})], now)).toEqual([
      expect.objectContaining({ id: 'q1', state: 'waiting', amount: 4500, currency: 'AED', hasPdf: true }),
    ])
  })
  it('hides quotes with no link, a turned off or expired link, or a status that cannot be accepted', () => {
    const rows = [
      q({ id: 'none', links: [] }),
      q({ id: 'off', links: [{ ...link, revoked_at: '2026-10-21T00:00:00Z' }] }),
      q({ id: 'old', links: [{ ...link, expires_at: '2026-10-01T00:00:00Z' }] }),
      q({ id: 'draft', status: 'Draft' }),
    ]
    expect(portalQuotes(rows, now)).toEqual([])
  })
  it('keeps an accepted quote with who accepted it', () => {
    const rows = [q({ status: 'Accepted', links: [{ ...link, accepted_at: '2026-10-22T09:00:00Z', accepted_name: 'Sara Ali' }] })]
    expect(portalQuotes(rows, now)[0]).toMatchObject({ state: 'accepted', acceptedBy: 'Sara Ali', acceptedOn: '22 Oct 2026' })
  })
  it('uses the quote currency and sorts newest first', () => {
    const rows = [q({ id: 'a', date: '2026-10-01' }), q({ id: 'b', date: '2026-10-21', quotation_currency: 'USD' })]
    const out = portalQuotes(rows, now)
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
    expect(out[0].currency).toBe('USD')
  })
})

describe('portal invoices', () => {
  const inv = (over: Record<string, unknown>) => ({
    id: 'i1',
    reference_number: 'RR-07-26001',
    date: '2026-10-01',
    amount: 4725,
    status: 'Sent',
    payment_status: 'Unpaid',
    payment_terms: 'Net 30',
    pay_link_url: 'https://checkout.stripe.com/c/pay/abc',
    ...over,
  })
  it('works out what is owed from the payments and offers the pay link', () => {
    const [i] = portalInvoices([inv({})], [{ invoice_ref: 'RR-07-26001', amount: 725 }])
    expect(i).toMatchObject({ balance: 4000, paid: false, due: '2026-10-31', payUrl: 'https://checkout.stripe.com/c/pay/abc' })
  })
  it('drops the pay link once paid', () => {
    const [a, b] = portalInvoices(
      [inv({ id: 'a', date: '2026-10-02', payment_status: 'Paid' }), inv({ id: 'b', reference_number: 'RR-07-26002' })],
      [{ invoice_ref: 'RR-07-26002', amount: 4725 }],
    )
    expect(a).toMatchObject({ id: 'a', paid: true, balance: 0, payUrl: null })
    expect(b).toMatchObject({ id: 'b', paid: true, balance: 0, payUrl: null })
  })
  it('hides drafts and cancelled invoices, and links that are not https', () => {
    const out = portalInvoices([inv({ id: 'd', status: 'Draft' }), inv({ id: 'c', status: 'Cancelled' }), inv({ id: 'x', pay_link_url: 'http://bad' })], [])
    expect(out.map((r) => r.id)).toEqual(['x'])
    expect(out[0].payUrl).toBeNull()
  })
})

describe('portal view extras', () => {
  it('carries ticket ids, quotes, invoices and uploads', () => {
    const view = buildPortalView(
      input({
        tickets: [{ id: 't1', subject: 'Help', status: 'open', created_at: '2026-10-22T06:00:00Z', sla_due_at: null, first_response_at: null, resolved_at: null }],
        invoices: [{ id: 'i1', reference_number: 'RR-07-1', date: '2026-10-01', amount: 100, status: 'Sent', payment_status: 'Unpaid', payment_terms: '' }],
        payments: [],
        uploads: [{ filename: 'logo.png', size_bytes: 2048, created_at: '2026-10-22T06:00:00Z', status: 'filed' }],
      }),
    )
    expect(view.openTickets[0].id).toBe('t1')
    expect(view.invoices).toHaveLength(1)
    expect(view.quotes).toEqual([])
    expect(view.uploads).toEqual([{ filename: 'logo.png', size: '2 KB', uploaded: '22 Oct 2026', saved: true }])
  })
  it('has empty lists when the extras are not loaded', () => {
    const view = buildPortalView(input())
    expect(view.quotes).toEqual([])
    expect(view.invoices).toEqual([])
    expect(view.uploads).toEqual([])
  })
})

describe('portal messages and uploads', () => {
  it('checks a ticket message', () => {
    expect(portalMessageProblem('  ')).toMatch(/Write/)
    expect(portalMessageProblem('x'.repeat(4001))).toMatch(/4000/)
    expect(portalMessageProblem('Thanks, that works')).toBeNull()
  })
  it('cleans file names', () => {
    expect(safeUploadName('C:\\Users\\me\\My <logo>.png')).toBe('My _logo_.png')
    expect(safeUploadName('../../etc/passwd')).toBe('passwd')
    expect(safeUploadName('')).toBe('file')
    expect(safeUploadName(`${'a'.repeat(200)}.pdf`)).toHaveLength(120)
    expect(safeUploadName(`${'a'.repeat(200)}.pdf`).endsWith('.pdf')).toBe(true)
  })
  it('only takes allowed types up to 5 MB', () => {
    expect(uploadContentType('Menu.PDF')).toBe('application/pdf')
    expect(uploadContentType('run.exe')).toBeNull()
    expect(uploadContentType('page.html')).toBeNull()
    expect(portalUploadProblem({ filename: 'run.exe', size: 10 })).toMatch(/type/)
    expect(portalUploadProblem({ filename: 'a.pdf', size: 0 })).toMatch(/empty/)
    expect(portalUploadProblem({ filename: 'a.pdf', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
    expect(portalUploadProblem({ filename: 'a.pdf', size: 5 * 1024 * 1024 })).toBeNull()
  })
  it('measures base64 without decoding', () => {
    expect(base64Bytes(btoa('hello'))).toBe(5)
    expect(base64Bytes(btoa('hell'))).toBe(4)
    expect(base64Bytes(btoa('hel'))).toBe(3)
    expect(base64Bytes('')).toBe(0)
  })
  it('labels sizes', () => {
    expect(sizeLabel(100)).toBe('1 KB')
    expect(sizeLabel(3 * 1024 * 1024)).toBe('3 MB')
  })
})
