import { describe, expect, it } from 'vitest'
import type { PortalView } from './clientPortal'
import {
  PORTAL_BUILD_CSV_HEADERS,
  PORTAL_INVOICES_CSV_HEADERS,
  PORTAL_QUOTES_CSV_HEADERS,
  PORTAL_TICKETS_CSV_HEADERS,
  applyPortalCsv,
  detectPortalCsvKind,
} from './clientPortalCsv'

const emptyReport = {
  month: '2026-11-01',
  label: 'Nov 2026',
  hours: 0,
  targetHours: null,
  hoursByWork: [],
  ticketsOpened: 0,
  ticketsResolved: [],
  answeredOnTime: 0,
  answered: 0,
  usage: null,
  nextMonthLabel: 'Dec 2026',
  comingNext: [],
}

function baseView(over: Partial<PortalView> = {}): PortalView {
  return {
    companyName: 'Red Reach',
    account: { name: 'Acme', reference: 'ACME' },
    plan: null,
    build: {
      done: 0,
      total: 2,
      percent: 0,
      current: 'Discovery',
      live: false,
      stages: [
        { label: 'Discovery', status: 'In progress', due: '1 Nov 2026' },
        { label: 'Build', status: 'Not started', due: null },
      ],
    },
    openTickets: [{ id: 't1', subject: 'Help', status: 'Open', opened: '1 Nov 2026', note: 'Received', late: false }],
    goLive: null,
    quotes: [
      {
        id: 'q1',
        reference: 'Q-1',
        date: '1 Nov 2026',
        validUntil: null,
        amount: 100,
        currency: 'AED',
        state: 'waiting',
        acceptedBy: '',
        acceptedOn: null,
        hasPdf: false,
      },
    ],
    invoices: [
      {
        id: 'i1',
        reference: 'INV-1',
        date: '1 Nov 2026',
        due: null,
        amount: 200,
        currency: 'AED',
        balance: 200,
        paid: false,
        payUrl: 'https://pay.example/1',
      },
    ],
    uploads: [],
    recentlyResolved: [],
    usage: [],
    reportMonths: [],
    report: emptyReport,
    ...over,
  }
}

describe('clientPortalCsv', () => {
  it('detects export formats from headers', () => {
    expect(detectPortalCsvKind([...PORTAL_BUILD_CSV_HEADERS])).toBe('build')
    expect(detectPortalCsvKind([...PORTAL_TICKETS_CSV_HEADERS])).toBe('tickets')
    expect(detectPortalCsvKind([...PORTAL_QUOTES_CSV_HEADERS])).toBe('quotes')
    expect(detectPortalCsvKind([...PORTAL_INVOICES_CSV_HEADERS])).toBe('invoices')
    expect(detectPortalCsvKind(['foo'])).toBeNull()
  })

  it('applies build CSV and refreshes progress', () => {
    const r = applyPortalCsv(baseView(), 'build', [
      { stage: 'Discovery', status: 'Done', due: '' },
      { stage: 'Build', status: 'In progress', due: '15 Nov 2026' },
    ])
    expect(r.applied).toBe(2)
    expect(r.view.build.stages[0].status).toBe('Done')
    expect(r.view.build.stages[1].due).toBe('15 Nov 2026')
    expect(r.view.build.done).toBe(1)
    expect(r.view.build.current).toBe('Build')
    expect(r.view.build.live).toBe(false)
  })

  it('updates and adds tickets from CSV', () => {
    const r = applyPortalCsv(baseView(), 'tickets', [
      { subject: 'Help', status: 'Waiting', opened: '1 Nov 2026', note: 'Waiting for your reply' },
      { subject: 'New one', status: 'Open', opened: '2 Nov 2026', note: 'Received' },
    ])
    expect(r.applied).toBe(2)
    expect(r.view.openTickets).toHaveLength(2)
    expect(r.view.openTickets[0].status).toBe('Waiting')
    expect(r.view.openTickets[1].subject).toBe('New one')
  })

  it('updates quotes and invoices from CSV', () => {
    const quotes = applyPortalCsv(baseView(), 'quotes', [
      { reference: 'Q-1', date: '2 Nov 2026', amount: '150', currency: 'AED', state: 'accepted' },
    ])
    expect(quotes.view.quotes[0].amount).toBe(150)
    expect(quotes.view.quotes[0].state).toBe('accepted')

    const invoices = applyPortalCsv(baseView(), 'invoices', [
      { reference: 'INV-1', date: '1 Nov 2026', amount: '200', currency: 'AED', balance: '0', paid: 'yes' },
    ])
    expect(invoices.view.invoices[0].paid).toBe(true)
    expect(invoices.view.invoices[0].balance).toBe(0)
    expect(invoices.view.invoices[0].payUrl).toBeNull()
  })
})
