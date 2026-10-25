import { describe, expect, it } from 'vitest'
import { contractDraftItems } from './dailyDigest'
import { DEFAULT_DELIVERY_RATES } from './delivery'
import {
  billingSettings,
  invoiceLineRows,
  runBilling,
  scheduleIsRunning,
  type BillingData,
  type BillingDb,
  type ClaimRow,
} from './contractBillingRun'
import { toPersistedLineItemRows, newDraftLine } from './lineItems'
import type { Contract, ContractInvoice, DeliveryPackage, Invoice } from './types'

type Row = Record<string, unknown>

/** An in-memory database with the same unique key as contract_invoices. */
function memoryDb() {
  const claims: ClaimRow[] = []
  const invoices: Row[] = []
  const lines: Row[] = []
  const events: string[] = []
  let n = 0
  const dbx: BillingDb = {
    newId: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`,
    async claim(row) {
      await Promise.resolve()
      if (claims.some((c) => c.contract_id === row.contract_id && c.kind === row.kind && c.period === row.period)) return false
      claims.push({ ...row })
      return true
    },
    async releaseClaim(id) {
      claims.splice(claims.findIndex((c) => c.id === id), 1)
    },
    async insertInvoice(row) {
      invoices.push({ ...row })
    },
    async replaceLines(reference, rows) {
      for (let i = lines.length - 1; i >= 0; i--) if (lines[i].reference === reference) lines.splice(i, 1)
      lines.push(...rows)
    },
    async linkClaim(claimId, invoiceId) {
      claims.find((c) => c.id === claimId)!.invoice_id = invoiceId
    },
    async setClaimAmount(claimId, amount) {
      claims.find((c) => c.id === claimId)!.generated_amount = amount
    },
    async setDiscountMonthsLeft() {},
    async getInvoice(id) {
      return (invoices.find((i) => i.id === id) as Invoice | undefined) ?? null
    },
    async updateInvoice(id, fields) {
      Object.assign(invoices.find((i) => i.id === id)!, fields)
    },
    async logEvent(_accountId, body) {
      events.push(body)
    },
  }
  return { dbx, claims, invoices, lines, events }
}

const contract = {
  id: 'c1',
  account_id: 'a1',
  package_id: 'p1',
  status: 'active',
  term_start: '2026-10-10',
  term_end: '2027-10-09',
  monthly_fee: 4200,
  setup_fee: 3000,
  setup_fee_paid: 0,
  discount_percent: 0,
  discount_months_left: 0,
  annual_prepay: false,
  option: 'B',
  created_at: '2026-10-10T08:00:00Z',
  auto_invoice: true,
  billing_from: null,
} as unknown as Contract

function data(m: ReturnType<typeof memoryDb>, over: Partial<BillingData> = {}): BillingData {
  return {
    contracts: [contract],
    packages: [{ id: 'p1', name: 'Growth', included_whatsapp: 4000, ai_cap_usd: 50, included_lead_credits_usd: 0 } as DeliveryPackage],
    accounts: [{ id: 'a1', name: 'Clinic LLC' }],
    usage: [],
    existing: m.claims as unknown as ContractInvoice[],
    ...over,
  }
}

const run = (m: ReturnType<typeof memoryDb>, today = new Date('2026-11-02T06:00:00')) =>
  runBilling({
    data: data(m, { existing: [...m.claims] as unknown as ContractInvoice[] }),
    dbx: m.dbx,
    cfg: billingSettings({}),
    rates: DEFAULT_DELIVERY_RATES,
    authorEmail: 'RR Central daily run',
    today,
  })

describe('contract billing run (shared by the app and the 06:00 schedule)', () => {
  it('raises the setup fee and the month as drafts, division 03, Net 7 days', async () => {
    const m = memoryDb()
    const result = await run(m)
    expect(result.raised).toBe(2)
    expect(m.invoices.map((i) => i.description)).toEqual(['Setup fee, Growth package', 'Growth package, November 2026'])
    for (const inv of m.invoices) {
      expect(inv.status).toBe('Draft')
      expect(inv.vertical).toBe('RR Marketing')
      expect(inv.payment_terms).toBe('Net 7 days')
      expect(String(inv.reference_number)).toMatch(/^INV-DRAFT-/)
      expect(inv.created_by).toBe('RR Central daily run')
      expect(inv.date).toBe('2026-11-02')
    }
    expect(m.claims.every((c) => c.invoice_id)).toBe(true)
    expect(m.events).toHaveLength(2)
  })

  it('running twice the same day raises nothing more', async () => {
    const m = memoryDb()
    await run(m)
    const again = await run(m)
    expect(again.raised).toBe(0)
    expect(m.invoices).toHaveLength(2)
  })

  it('the app and the schedule at the same moment still raise each invoice once', async () => {
    const m = memoryDb()
    // Both read the claims before either writes, as two callers would.
    const before = [...m.claims] as unknown as ContractInvoice[]
    const go = () =>
      runBilling({
        data: data(m, { existing: before }),
        dbx: m.dbx,
        cfg: billingSettings({}),
        rates: DEFAULT_DELIVERY_RATES,
        authorEmail: 'x',
        today: new Date('2026-11-02T06:00:00'),
      })
    const [a, b] = await Promise.all([go(), go()])
    expect(a.raised + b.raised).toBe(2)
    expect(m.invoices).toHaveLength(2)
  })

  it('raises next month on the first run of that month', async () => {
    const m = memoryDb()
    await run(m)
    const december = await run(m, new Date('2026-12-01T06:00:00'))
    expect(december.drafted.map((d) => d.description)).toEqual(['Growth package, December 2026'])
  })

  it('skips contracts with automatic invoicing off', async () => {
    const m = memoryDb()
    const result = await runBilling({
      data: data(m, { contracts: [{ ...contract, auto_invoice: false } as Contract] }),
      dbx: m.dbx,
      cfg: billingSettings({}),
      rates: DEFAULT_DELIVERY_RATES,
      authorEmail: 'x',
      today: new Date('2026-11-02T06:00:00'),
    })
    expect(result.raised).toBe(0)
  })

  it('frees the month again when the invoice cannot be saved', async () => {
    const m = memoryDb()
    m.dbx.insertInvoice = async () => {
      throw new Error('invoices: offline')
    }
    await expect(run(m)).rejects.toThrow('offline')
    expect(m.claims).toHaveLength(0)
  })

  it('saves the same line rows the invoice editor saves', () => {
    const plan = {
      kind: 'monthly' as const,
      period: '2026-11-01',
      description: 'x',
      lines: [
        { description: 'Monthly fee', qty: 1, unit_price: 4200 },
        { description: 'WhatsApp over the plan', qty: 37, unit_price: 0.33 },
      ],
      subtotal: 4212.21,
      usesDiscountMonth: false,
    }
    const editor = toPersistedLineItemRows(
      'Invoice',
      'INV-DRAFT-1',
      plan.lines.map((l) => newDraftLine(l)),
      0.05,
    )
    expect(invoiceLineRows('INV-DRAFT-1', plan, 0.05)).toEqual(editor)
  })
})

describe('the app waits for the schedule', () => {
  const now = new Date('2026-11-02T10:00:00Z')
  it('leaves billing to the schedule when it ran in the last 36 hours', () => {
    expect(scheduleIsRunning('2026-11-02T02:00:00Z', now)).toBe(true)
    expect(scheduleIsRunning('2026-11-01T02:00:00Z', now)).toBe(true)
  })
  it('raises invoices itself when the schedule is not set up or has stopped', () => {
    expect(scheduleIsRunning(undefined, now)).toBe(false)
    expect(scheduleIsRunning('', now)).toBe(false)
    expect(scheduleIsRunning('not a date', now)).toBe(false)
    expect(scheduleIsRunning('2026-10-31T02:00:00Z', now)).toBe(false)
  })
})

describe('digest row', () => {
  it('says how many contract invoices were drafted today', () => {
    expect(contractDraftItems(0)).toEqual([])
    expect(contractDraftItems(1)[0].name).toBe('1 contract invoice drafted today')
    expect(contractDraftItems(3)[0]).toMatchObject({ name: '3 contract invoices drafted today', path: '/invoices' })
  })
})
