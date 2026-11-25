import { describe, expect, it } from 'vitest'
import {
  agingBucket,
  agingSummary,
  agingTotalsByCurrency,
  buildAgingRows,
  chaseDraft,
  chaseSettingsFrom,
  chaseSteps,
  currentPromise,
  DEFAULT_CHASE_SETTINGS,
  filterAgingRows,
  groupAgingByClient,
  invoiceDivision,
  parseReminderDays,
  planChaseTasks,
  sortAgingRows,
  tasksToClose,
  type AgingInvoice,
  type ChaseLogEntry,
  type ChaseTask,
} from './arChase'

// The brief's real data, as on 25 Nov 2026.
const TODAY = new Date('2026-11-25T08:00:00Z')
const inv = (id: string, ref: string, client: string, date: string, amount: number, extra: Partial<AgingInvoice> = {}): AgingInvoice => ({
  id,
  client,
  reference_number: ref,
  date,
  amount,
  currency: 'AED',
  status: 'Sent',
  payment_status: 'Pending',
  payment_terms: 'Net 30',
  ...extra,
})
const BRIEF = [
  inv('i102', 'RR-03-26102', 'Mass Allied Freighters', '2026-09-01', 37500, { account_id: 'acc-mass' }), // due 1 Oct: 55 days
  inv('i104', 'RR-03-26104', 'Mass Allied Freighters', '2026-09-15', 37500, { account_id: 'acc-mass' }), // due 15 Oct: 41 days
  inv('i105', 'RR-03-26105', 'Mass Allied Freighters', '2026-09-15', 37500, { account_id: 'acc-mass' }), // 41 days
  inv('i103', 'RR-03-26103', 'Arabian Sky Business Center', '2026-09-30', 1732.5), // due 30 Oct: 26 days
]
const NOISE = [
  inv('draft', 'RR-01-26001', 'Draft Co', '2026-08-01', 999, { status: 'Draft' }),
  inv('paid', 'RR-01-26002', 'Paid Co', '2026-08-01', 500, { payment_status: 'Paid' }),
  inv('cancel', 'RR-01-26003', 'Cancelled Co', '2026-08-01', 700, { status: 'Cancelled' }),
  inv('settled', 'RR-01-26004', 'Settled Co', '2026-08-01', 300),
  inv('fresh', 'RR-06-26010', 'Fresh Trading', '2026-11-20', 2100, { currency: 'USD' }),
]
const PAID = new Map([['RR-01-26004', 300]])

function rows(log: ChaseLogEntry[] = [], tasks: ChaseTask[] = [], settings = DEFAULT_CHASE_SETTINGS) {
  return buildAgingRows({ invoices: [...BRIEF, ...NOISE], paid: PAID, log, tasks, settings, today: TODAY })
}

const chase = (invoice_id: string, chased_on: string, promised_date: string | null, extra: Partial<ChaseLogEntry> = {}): ChaseLogEntry => ({
  id: `${invoice_id}-${chased_on}`,
  invoice_id,
  chased_on,
  channel: 'call',
  contact: 'Accounts',
  note: 'Called',
  promised_date,
  created_by_email: 'sales@redreach.ae',
  created_at: chased_on + 'T09:00:00Z',
  ...extra,
})

describe('aging buckets', () => {
  it('puts the four brief invoices in the right buckets with AED 114,232.50 overdue', () => {
    const r = rows()
    const byRef = new Map(r.map((x) => [x.reference, x]))
    expect(byRef.get('RR-03-26102')).toMatchObject({ days_overdue: 55, bucket: '31-60', balance: 37500 })
    expect(byRef.get('RR-03-26104')).toMatchObject({ days_overdue: 41, bucket: '31-60' })
    expect(byRef.get('RR-03-26105')).toMatchObject({ days_overdue: 41, bucket: '31-60' })
    expect(byRef.get('RR-03-26103')).toMatchObject({ days_overdue: 26, bucket: '1-30', balance: 1732.5 })
    const totals = agingTotalsByCurrency(r)
    expect(totals.AED.overdue).toBe(114232.5)
    expect(totals.AED['31-60']).toBe(112500)
    expect(totals.AED['1-30']).toBe(1732.5)
    expect(totals.AED.total).toBe(114232.5)
    expect(totals.AED.count).toBe(4)
  })

  it('leaves out drafts, cancelled, paid and fully settled invoices; keeps currencies apart', () => {
    const r = rows()
    expect(r.map((x) => x.reference)).not.toContain('RR-01-26001')
    expect(r.map((x) => x.reference)).not.toContain('RR-01-26002')
    expect(r.map((x) => x.reference)).not.toContain('RR-01-26003')
    expect(r.map((x) => x.reference)).not.toContain('RR-01-26004')
    const totals = agingTotalsByCurrency(r)
    expect(totals.USD).toMatchObject({ current: 2100, overdue: 0, total: 2100 })
  })

  it('uses the balance after part payments', () => {
    const r = buildAgingRows({
      invoices: BRIEF,
      paid: new Map([['RR-03-26102', 10000]]),
      log: [],
      tasks: [],
      settings: DEFAULT_CHASE_SETTINGS,
      today: TODAY,
    })
    expect(r.find((x) => x.reference === 'RR-03-26102')!.balance).toBe(27500)
  })

  it('bucket edges', () => {
    expect(agingBucket(null)).toBe('current')
    expect(agingBucket(0)).toBe('current')
    expect(agingBucket(1)).toBe('1-30')
    expect(agingBucket(30)).toBe('1-30')
    expect(agingBucket(31)).toBe('31-60')
    expect(agingBucket(60)).toBe('31-60')
    expect(agingBucket(61)).toBe('61-90')
    expect(agingBucket(90)).toBe('61-90')
    expect(agingBucket(91)).toBe('90+')
  })

  it('groups by client, filters by client and division, and sorts', () => {
    const r = rows()
    const groups = groupAgingByClient(r)
    expect(groups[0].client).toBe('Mass Allied Freighters')
    expect(groups[0].totals.AED.total).toBe(112500)
    expect(filterAgingRows(r, { client: 'arabian sky business center' }).map((x) => x.reference)).toEqual(['RR-03-26103'])
    expect(filterAgingRows(r, { division: '06' }).map((x) => x.reference)).toEqual(['RR-06-26010'])
    expect(filterAgingRows(r, { bucket: '31-60' })).toHaveLength(3)
    expect(sortAgingRows(r, 'balance', 'asc')[0].reference).toBe('RR-03-26103')
    expect(sortAgingRows(r, 'days_overdue', 'desc')[0].reference).toBe('RR-03-26102')
    expect(sortAgingRows(r, 'client', 'asc')[0].client).toBe('Arabian Sky Business Center')
  })

  it('reads the division from the reference, else the brand', () => {
    expect(invoiceDivision({ reference_number: 'RR-03-26102' })).toBe('03')
    expect(invoiceDivision({ reference_number: 'INV-7', vertical: 'RR Threads' })).toBe('01')
    expect(invoiceDivision({ reference_number: '' })).toBe('')
  })
})

describe('schedule', () => {
  it('defaults to 1, 7, 14, 30 and escalation at 45', () => {
    expect(chaseSteps(DEFAULT_CHASE_SETTINGS)).toEqual([
      { day: 1, kind: 'reminder' },
      { day: 7, kind: 'reminder' },
      { day: 14, kind: 'reminder' },
      { day: 30, kind: 'reminder' },
      { day: 45, kind: 'escalate' },
    ])
    expect(chaseSettingsFrom(null)).toEqual(DEFAULT_CHASE_SETTINGS)
  })

  it('takes a tenant schedule and ignores bad values', () => {
    expect(chaseSettingsFrom({ reminder_days: [10, 3, 3, 0, 400], escalate_days: 20, escalate_to_user_id: 'u1' })).toEqual({
      reminderDays: [3, 10],
      escalateDays: 20,
      escalateToUserId: 'u1',
    })
    expect(chaseSteps(chaseSettingsFrom({ reminder_days: [5, 20], escalate_days: 20 }))).toEqual([
      { day: 5, kind: 'reminder' },
      { day: 20, kind: 'escalate' },
    ])
    expect(parseReminderDays('1, 7 14;30')).toEqual({ days: [1, 7, 14, 30] })
    expect(parseReminderDays('0, 7')).toHaveProperty('error')
    expect(parseReminderDays('')).toHaveProperty('error')
  })
})

describe('tasks', () => {
  it('adds one task per invoice for the latest step reached; escalation goes to the owner', () => {
    const r = rows()
    const plan = planChaseTasks({
      rows: r,
      tasks: [],
      settings: { ...DEFAULT_CHASE_SETTINGS, escalateToUserId: 'owner-1' },
      ownerByAccount: new Map([['acc-mass', 'sales-1']]),
    })
    const by = new Map(plan.map((p) => [p.invoice_id, p]))
    expect(by.get('i102')).toEqual({ invoice_id: 'i102', step_day: 45, kind: 'escalate', due_on: '2026-11-15', assigned_to: 'owner-1' })
    expect(by.get('i104')).toMatchObject({ step_day: 30, kind: 'reminder', due_on: '2026-11-14', assigned_to: 'sales-1' })
    expect(by.get('i103')).toMatchObject({ step_day: 14, kind: 'reminder', due_on: '2026-11-13', assigned_to: null })
    expect(by.has('fresh')).toBe(false)
    expect(plan).toHaveLength(4)
  })

  it('does not add a task twice, nor while a promise is pending', () => {
    const tasks = [{ invoice_id: 'i102', step_day: 45 }] as ChaseTask[]
    const log = [chase('i104', '2026-11-24', '2026-11-30')]
    const plan = planChaseTasks({ rows: rows(log), tasks, settings: DEFAULT_CHASE_SETTINGS })
    expect(plan.map((p) => p.invoice_id).sort()).toEqual(['i103', 'i105'])
  })

  it('closes open tasks of invoices no longer owing', () => {
    const tasks = [
      { id: 't1', invoice_id: 'i102', status: 'open' },
      { id: 't2', invoice_id: 'paid', status: 'open' },
      { id: 't3', invoice_id: 'paid', status: 'done' },
    ] as ChaseTask[]
    expect(tasksToClose(tasks, rows())).toEqual(['t2'])
  })
})

describe('promises and next action', () => {
  it('flags a passed promise with money owing as broken', () => {
    const log = [chase('i102', '2026-11-10', '2026-11-20'), chase('i104', '2026-11-20', '2026-11-28')]
    const r = rows(log)
    const a = r.find((x) => x.invoice_id === 'i102')!
    expect(a.promise).toMatchObject({ date: '2026-11-20', state: 'broken' })
    expect(a.next_action.kind).toBe('promise_broken')
    const b = r.find((x) => x.invoice_id === 'i104')!
    expect(b.promise?.state).toBe('pending')
    expect(b.next_action).toMatchObject({ kind: 'await_promise', due_on: '2026-11-29' })
    expect(agingSummary(r).broken_promises.map((p) => p.reference)).toEqual(['RR-03-26102'])
  })

  it('the newest promise counts, and today is not yet broken', () => {
    const log = [chase('i102', '2026-11-01', '2026-11-05'), chase('i102', '2026-11-12', '2026-11-25')]
    expect(currentPromise(log, 100, '2026-11-25')).toMatchObject({ date: '2026-11-25', state: 'pending' })
    expect(currentPromise(log, 0, '2026-11-26')?.state).toBe('kept')
    expect(currentPromise([log[0], { ...log[1], deleted_at: '2026-11-13' }], 100, '2026-11-26')).toMatchObject({ date: '2026-11-05' })
  })

  it('an open task comes next, else the next step on the schedule', () => {
    const tasks: ChaseTask[] = [
      { id: 't', invoice_id: 'i103', step_day: 14, kind: 'reminder', due_on: '2026-11-13', assigned_to: null, status: 'open', outcome: '', done_at: null, done_by_email: '' },
    ]
    const r = rows([], tasks)
    expect(r.find((x) => x.invoice_id === 'i103')!.next_action).toMatchObject({ kind: 'task', task_id: 't', due_on: '2026-11-13' })
    expect(r.find((x) => x.invoice_id === 'i104')!.next_action).toMatchObject({ kind: 'reminder', due_on: '2026-11-25', text: 'Send the day 30 reminder now.' })
    const day30Done: ChaseTask[] = [{ ...tasks[0], id: 'd30', invoice_id: 'i104', step_day: 30, status: 'done' }]
    expect(rows([], day30Done).find((x) => x.invoice_id === 'i104')!.next_action).toMatchObject({ kind: 'escalate', due_on: '2026-11-29' })
    expect(r.find((x) => x.invoice_id === 'fresh')!.next_action).toMatchObject({ kind: 'reminder', due_on: '2026-12-21' })
    expect(r.find((x) => x.invoice_id === 'i102')!.next_action).toMatchObject({ kind: 'escalate', due_on: '2026-11-25' })
    const done: ChaseTask[] = [{ ...tasks[0], id: 'e', invoice_id: 'i102', step_day: 45, kind: 'escalate', status: 'done' }]
    expect(rows([], done).find((x) => x.invoice_id === 'i102')!.next_action.kind).toBe('none')
  })

  it('summary lists the next chase action for every overdue invoice', () => {
    const s = agingSummary(rows())
    expect(s.next_chase_actions).toHaveLength(4)
    expect(s.totals_by_currency.AED.overdue).toBe(114232.5)
    expect(s.next_chase_actions.every((a) => a.next_action.length > 0)).toBe(true)
  })
})

describe('drafts', () => {
  it('are drafts for a person to send, with the balance and days', () => {
    const d = chaseDraft({
      kind: 'escalate',
      stepDay: 45,
      reference: 'RR-03-26102',
      client: 'Mass Allied Freighters',
      contactName: '',
      balance: 37500,
      currency: 'AED',
      dueDate: '2026-10-01',
      daysOverdue: 55,
      companyName: 'Red Reach Middle East FZE',
      promise: { date: '2026-11-20', state: 'broken', logged_on: '2026-11-10', contact: '' },
    })
    expect(d.subject).toContain('RR-03-26102')
    expect(d.subject).toContain('55 days')
    expect(d.body).toContain('Mass Allied Freighters accounts team')
    expect(d.body).toContain('2026-11-20')
    expect(d.whatsapp).toContain('37,500.00')
    const r = chaseDraft({ ...{ kind: 'reminder', stepDay: 1, reference: 'X', client: 'C', contactName: 'Sara', balance: 1, currency: 'AED', dueDate: null, daysOverdue: 1, companyName: 'RR' } })
    expect(r.body).toContain('friendly reminder')
    expect(r.body).toContain('1 day overdue')
  })
})
