import { describe, expect, it } from 'vitest'
import {
  buildQuoteChaseRows,
  currentCallback,
  DEFAULT_QUOTE_CHASE_SETTINGS,
  filterQuoteChaseRows,
  isChaseable,
  parseFollowupDays,
  planQuoteChaseTasks,
  quoteChaseDraft,
  quoteChaseSettingsFrom,
  quoteChaseTotalsByCurrency,
  quoteDivision,
  quoteFollowupSummary,
  quoteSteps,
  quoteTasksToClose,
  sortQuoteChaseRows,
  stepCovered,
  waitBucket,
  type ChaseQuote,
  type QuoteChaseEntry,
  type QuoteChaseTask,
} from './quoteChase'

const S = DEFAULT_QUOTE_CHASE_SETTINGS
const day = (iso: string) => new Date(`${iso}T08:00:00Z`)

const quote = (id: string, ref: string, client: string, extra: Partial<ChaseQuote> = {}): ChaseQuote => ({
  id,
  client,
  reference_number: ref,
  division_code: ref.slice(3, 5),
  amount: 10000,
  quotation_currency: 'AED',
  status: 'Sent',
  sent_at: '2026-11-01T09:00:00Z',
  valid_until: '2026-12-31',
  ...extra,
})

const entry = (quotation_id: string, chased_on: string, extra: Partial<QuoteChaseEntry> = {}): QuoteChaseEntry => ({
  id: `${quotation_id}-${chased_on}-${Math.random()}`,
  quotation_id,
  chased_on,
  channel: 'call',
  contact: 'Procurement',
  note: 'Spoke to them',
  response: '',
  next_follow_up: null,
  created_by_email: 'sales@redreach.ae',
  created_at: `${chased_on}T10:00:00Z`,
  ...extra,
})

const task = (quotation_id: string, kind: QuoteChaseTask['kind'], step_day: number, due_on: string, extra: Partial<QuoteChaseTask> = {}): QuoteChaseTask => ({
  id: `t-${quotation_id}-${kind}-${step_day}`,
  quotation_id,
  kind,
  step_day,
  due_on,
  assigned_to: null,
  status: 'open',
  outcome: '',
  done_at: null,
  done_by_email: '',
  ...extra,
})

const rows = (quotes: ChaseQuote[], today: string, more: Partial<Parameters<typeof buildQuoteChaseRows>[0]> = {}) =>
  buildQuoteChaseRows({ quotes, log: [], tasks: [], settings: S, today: day(today), ...more })

describe('settings', () => {
  it('defaults to 3, 7, 14 days, 3 before expiry, escalate at 21', () => {
    expect(quoteChaseSettingsFrom(null)).toEqual({ followupDays: [3, 7, 14], expiryWarnDays: 3, escalateDays: 21, escalateToUserId: null })
  })
  it('reads a row, dropping bad days, and keeps 0 as "no expiry reminder"', () => {
    expect(quoteChaseSettingsFrom({ followup_days: [10, 2, 2, 0, 400], expiry_warn_days: 0, escalate_days: 30 })).toEqual({
      followupDays: [2, 10],
      expiryWarnDays: 0,
      escalateDays: 30,
      escalateToUserId: null,
    })
    expect(quoteChaseSettingsFrom({ followup_days: [], escalate_days: 999 }).escalateDays).toBe(21)
  })
  it('parses typed days', () => {
    expect(parseFollowupDays('7, 3;14 3')).toEqual({ days: [3, 7, 14] })
    expect(parseFollowupDays('')).toEqual({ error: 'Add at least one follow-up day.' })
    expect(parseFollowupDays('3, 200')).toEqual({ error: '"200" is not a day between 1 and 180.' })
  })
})

describe('steps', () => {
  it('lists follow-ups, the expiry reminder and the escalation in date order', () => {
    expect(quoteSteps(S, '2026-11-01', '2026-11-20')).toEqual([
      { kind: 'followup', step_day: 3, due_on: '2026-11-04' },
      { kind: 'followup', step_day: 7, due_on: '2026-11-08' },
      { kind: 'followup', step_day: 14, due_on: '2026-11-15' },
      { kind: 'expiry', step_day: 3, due_on: '2026-11-17' },
      { kind: 'escalate', step_day: 21, due_on: '2026-11-22' },
    ])
  })
  it('skips the expiry reminder when it would fall before the quote went out, or when switched off', () => {
    expect(quoteSteps(S, '2026-11-01', '2026-11-03').some((s) => s.kind === 'expiry')).toBe(false)
    expect(quoteSteps({ ...S, expiryWarnDays: 0 }, '2026-11-01', '2026-11-30').some((s) => s.kind === 'expiry')).toBe(false)
  })
  it('a follow-up on the escalation day becomes the escalation', () => {
    const steps = quoteSteps({ ...S, followupDays: [3, 21] }, '2026-11-01', null)
    expect(steps.map((s) => `${s.kind}${s.step_day}`)).toEqual(['followup3', 'escalate21'])
  })
  it('a follow-up in the two days before a step covers it', () => {
    const step = { kind: 'followup' as const, step_day: 7, due_on: '2026-11-08' }
    expect(stepCovered(step, '2026-11-06')).toBe(true)
    expect(stepCovered(step, '2026-11-05')).toBe(false)
    expect(stepCovered(step, null)).toBe(false)
    expect(stepCovered({ ...step, kind: 'escalate' }, '2026-11-08')).toBe(false)
  })
})

describe('which quotes are on the list', () => {
  it('Sent and Accepted quotes, and quotes that expired up to 7 days ago', () => {
    const t = '2026-11-28'
    expect(isChaseable(quote('a', 'RR-01-1', 'A'), t)).toBe(true)
    expect(isChaseable(quote('a', 'RR-01-1', 'A', { status: 'Accepted' }), t)).toBe(true)
    expect(isChaseable(quote('a', 'RR-01-1', 'A', { status: 'Expired', valid_until: '2026-11-21' }), t)).toBe(true)
    expect(isChaseable(quote('a', 'RR-01-1', 'A', { status: 'Expired', valid_until: '2026-11-20' }), t)).toBe(false)
    for (const status of ['Draft', 'Finalized', 'Awarded', 'Not awarded', 'Superseded']) {
      expect(isChaseable(quote('a', 'RR-01-1', 'A', { status }), t), status).toBe(false)
    }
    expect(isChaseable(quote('a', 'RR-01-1', 'A', { deleted_at: '2026-11-02' }), t)).toBe(false)
  })
})

describe('rows: the brief data', () => {
  // As on 28 Nov 2026: Green Cement RR-01-26008 went out and expired on 25 Nov;
  // Sharjah ReadyMix RR-01-26007 has PO 4200050362 but still shows Sent.
  const GREEN = quote('q8', 'RR-01-26008', 'Green Cement', { sent_at: '2026-11-11T09:00:00Z', valid_until: '2026-11-25', amount: 52500 })
  const SHARJAH = quote('q7', 'RR-01-26007', 'Sharjah ReadyMix Concrete', { sent_at: '2026-10-20T09:00:00Z', valid_until: '2026-12-10', amount: 18900 })
  const PO = { quotation_id: 'q7', quote_reference: 'RR-01-26007', po_number: '4200050362', po_date: '2026-11-10' }

  it('flags the PO quote for award and the expired quote for a decision, before anything else', () => {
    const r = rows([GREEN, SHARJAH, quote('q9', 'RR-03-26009', 'Fresh Co', { sent_at: '2026-11-27T09:00:00Z' })], '2026-11-28', { pos: [PO] })
    expect(r.map((x) => x.reference)).toEqual(['RR-01-26007', 'RR-01-26008', 'RR-03-26009'])
    expect(r[0].next_action).toMatchObject({ kind: 'award', text: 'Client PO 4200050362 received: mark the quote Awarded.' })
    expect(r[0].po).toEqual({ po_number: '4200050362', po_date: '2026-11-10' })
    expect(r[1].validity).toBe('expired')
    expect(r[1].days_to_expiry).toBe(-3)
    expect(r[1].next_action.kind).toBe('expired')
    expect(r[1].next_action.text).toContain('revise it, extend the validity or mark it not awarded (on this list until 2026-12-02)')
    expect(r[2].next_action).toEqual({ kind: 'followup', due_on: '2026-11-30', text: 'Day 3 follow-up on 2026-11-30.' })
  })

  it('matches a PO by quote number when it is not linked by id', () => {
    const r = rows([SHARJAH], '2026-11-28', { pos: [{ quotation_id: null, quote_reference: 'rr-01-26007', po_number: 'PO-1' }] })
    expect(r[0].po?.po_number).toBe('PO-1')
  })

  it('keeps the expired quote on the list for 7 days, also once the quote list marks it Expired', () => {
    expect(rows([{ ...GREEN, status: 'Expired' }], '2026-12-02')).toHaveLength(1)
    expect(rows([{ ...GREEN, status: 'Expired' }], '2026-12-03')).toHaveLength(0)
  })
})

describe('rows: fields', () => {
  it('works out days waiting, bucket, division, currency, last contact and answer', () => {
    const q = quote('q1', 'RR-03-26050', 'Mass Allied', { quotation_currency: 'usd', followed_up_at: '2026-11-10T08:00:00Z' })
    const log = [entry('q1', '2026-11-05', { response: 'interested' }), entry('q1', '2026-11-08', { note: 'Left a message' })]
    const [r] = rows([q], '2026-11-20', { log })
    expect(r).toMatchObject({
      division: '03',
      currency: 'USD',
      sent_on: '2026-11-01',
      days_since_sent: 19,
      bucket: '15-30',
      chase_count: 2,
      last_contact_on: '2026-11-10',
      response: 'interested',
      validity: 'ok',
    })
    expect(r.last_chase?.chased_on).toBe('2026-11-08')
  })
  it('says expiring when the validity date is within the reminder days', () => {
    expect(rows([quote('q', 'RR-01-1', 'A', { valid_until: '2026-11-23' })], '2026-11-20')[0].validity).toBe('expiring')
    expect(rows([quote('q', 'RR-01-1', 'A', { valid_until: null })], '2026-11-20')[0].validity).toBe('none')
  })
  it('falls back to the quote date when it has no sent time', () => {
    expect(rows([quote('q', 'RR-01-1', 'A', { sent_at: null, date: '2026-11-15' })], '2026-11-20')[0].days_since_sent).toBe(5)
  })
  it('buckets by days waiting', () => {
    expect([0, 7, 8, 14, 15, 30, 31].map(waitBucket)).toEqual(['0-7', '0-7', '8-14', '8-14', '15-30', '15-30', '31+'])
  })
  it('takes the division from the quote, else from the number', () => {
    expect(quoteDivision({ division_code: '', reference_number: 'RR-06-26001' })).toBe('06')
    expect(quoteDivision({ division_code: '02', reference_number: 'X' })).toBe('02')
  })
})

describe('call-backs', () => {
  it('only the newest follow-up counts; missed once the date has passed', () => {
    const log = [entry('q', '2026-11-05', { next_follow_up: '2026-11-09', contact: 'Ali' })]
    expect(currentCallback(log, '2026-11-09')).toEqual({ date: '2026-11-09', state: 'pending', contact: 'Ali' })
    expect(currentCallback(log, '2026-11-10')).toEqual({ date: '2026-11-09', state: 'missed', contact: 'Ali' })
    expect(currentCallback([...log, entry('q', '2026-11-10')], '2026-11-12')).toBeNull()
  })
  it('a missed call-back comes before the schedule; a pending one holds it back', () => {
    const q = quote('q', 'RR-01-1', 'A')
    const missed = rows([q], '2026-11-12', { log: [entry('q', '2026-11-05', { next_follow_up: '2026-11-10', contact: 'Ali' })] })[0]
    expect(missed.next_action).toMatchObject({ kind: 'callback_missed', due_on: '2026-11-12' })
    const pending = rows([q], '2026-11-12', { log: [entry('q', '2026-11-05', { next_follow_up: '2026-11-14' })] })[0]
    expect(pending.next_action).toEqual({ kind: 'await_callback', due_on: '2026-11-14', text: 'Follow up on 2026-11-14 as agreed with Procurement.' })
  })
  it('a declined answer asks to close the quote', () => {
    const r = rows([quote('q', 'RR-01-1', 'A')], '2026-11-12', { log: [entry('q', '2026-11-11', { response: 'declined' })] })[0]
    expect(r.next_action.kind).toBe('close')
  })
  it('an Accepted quote asks to mark it Awarded', () => {
    expect(rows([quote('q', 'RR-01-1', 'A', { status: 'Accepted' })], '2026-11-12')[0].next_action.kind).toBe('award')
  })
})

describe('next action from the schedule', () => {
  const q = quote('q', 'RR-01-1', 'A')
  it('an open task comes first', () => {
    const r = rows([q], '2026-11-09', { tasks: [task('q', 'followup', 7, '2026-11-08')] })[0]
    expect(r.next_action).toMatchObject({ kind: 'task', task_id: 't-q-followup-7', text: 'Day 7 follow-up (draft ready).' })
  })
  it('a step reached with no task yet is due now', () => {
    expect(rows([q], '2026-11-09')[0].next_action).toEqual({ kind: 'followup', due_on: '2026-11-09', text: 'Day 7 follow-up now.' })
  })
  it('a covered step is skipped to the next one', () => {
    const r = rows([q], '2026-11-09', { log: [entry('q', '2026-11-07')] })[0]
    expect(r.next_action).toEqual({ kind: 'followup', due_on: '2026-11-15', text: 'Day 14 follow-up on 2026-11-15.' })
  })
  it('the expiry reminder can come after the escalation; after every step, ask for a decision', () => {
    const done = [task('q', 'escalate', 21, '2026-11-22', { status: 'done' })]
    expect(rows([q], '2026-12-20', { tasks: done })[0].next_action).toMatchObject({ kind: 'expiry', due_on: '2026-12-28' })
    expect(rows([{ ...q, valid_until: null }], '2026-12-20', { tasks: done })[0].next_action.kind).toBe('none')
  })
})

describe('planning tasks', () => {
  const q = quote('q', 'RR-01-1', 'A', { account_id: 'acc', created_by: 'Maker@RedReach.ae' })
  const plan = (today: string, more: Partial<Parameters<typeof planQuoteChaseTasks>[0]> = {}, build: Partial<Parameters<typeof buildQuoteChaseRows>[0]> = {}) =>
    planQuoteChaseTasks({ rows: rows([q], today, build), tasks: build.tasks || [], settings: S, today: day(today), ...more })

  it('adds the latest step reached only, assigned to the account owner', () => {
    expect(plan('2026-11-10', { ownerByAccount: new Map([['acc', 'owner-1']]) })).toEqual([
      { quotation_id: 'q', step_day: 7, kind: 'followup', due_on: '2026-11-08', assigned_to: 'owner-1' },
    ])
  })
  it('falls back to whoever made the quote, and escalations go to the escalation person', () => {
    expect(plan('2026-11-10', { userByEmail: new Map([['maker@redreach.ae', 'maker-1']]) })[0].assigned_to).toBe('maker-1')
    expect(plan('2026-11-23', { settings: { ...S, escalateToUserId: 'boss' } })[0]).toMatchObject({ kind: 'escalate', assigned_to: 'boss' })
  })
  it('adds nothing twice, never goes back to an earlier step, and nothing before the first step', () => {
    expect(plan('2026-11-10', {}, { tasks: [task('q', 'followup', 7, '2026-11-08', { status: 'done' })] })).toEqual([])
    expect(plan('2026-11-10', {}, { tasks: [task('q', 'escalate', 21, '2026-11-22')] })).toEqual([])
    expect(plan('2026-11-03')).toEqual([])
  })
  it('adds the expiry reminder when it is the latest step', () => {
    const near = quote('q', 'RR-01-1', 'A', { valid_until: '2026-11-20' })
    const out = planQuoteChaseTasks({ rows: rows([near], '2026-11-18'), tasks: [], settings: S, today: day('2026-11-18') })
    expect(out).toEqual([{ quotation_id: 'q', step_day: 3, kind: 'expiry', due_on: '2026-11-17', assigned_to: null }])
  })
  it('adds nothing when the step was covered, a call-back is pending, the client declined, a PO came in or it expired', () => {
    expect(plan('2026-11-09', {}, { log: [entry('q', '2026-11-07')] })).toEqual([])
    expect(plan('2026-11-09', {}, { log: [entry('q', '2026-11-05', { next_follow_up: '2026-11-12' })] })).toEqual([])
    expect(plan('2026-11-09', {}, { log: [entry('q', '2026-11-05', { response: 'declined' })] })).toEqual([])
    expect(plan('2026-11-09', {}, { pos: [{ quotation_id: 'q', po_number: 'P1' }] })).toEqual([])
    const expired = quote('q', 'RR-01-1', 'A', { valid_until: '2026-11-08' })
    expect(planQuoteChaseTasks({ rows: rows([expired], '2026-11-09'), tasks: [], settings: S, today: day('2026-11-09') })).toEqual([])
  })
  it('closes open tasks once the quote no longer waits for an answer', () => {
    const r = rows([quote('a', 'RR-01-1', 'A'), quote('b', 'RR-01-2', 'B', { status: 'Accepted' })], '2026-11-09')
    const tasks = [task('a', 'followup', 7, '2026-11-08'), task('b', 'followup', 7, '2026-11-08'), task('gone', 'followup', 3, '2026-11-04'), task('gone', 'followup', 7, '2026-11-08', { status: 'done' })]
    expect(quoteTasksToClose(tasks, r)).toEqual(['t-b-followup-7', 't-gone-followup-3'])
  })
})

describe('totals, filters and sorting', () => {
  const list = rows(
    [
      quote('a', 'RR-01-1', 'Alpha', { amount: 1000, sent_at: '2026-11-18T00:00:00Z' }),
      quote('b', 'RR-03-2', 'Beta', { amount: 2500.5, sent_at: '2026-11-01T00:00:00Z', valid_until: '2026-11-21' }),
      quote('c', 'RR-03-3', 'Gamma', { amount: 300, quotation_currency: 'USD', sent_at: '2026-10-01T00:00:00Z' }),
    ],
    '2026-11-20',
  )
  it('totals per currency by how long the quote waited, never across currencies', () => {
    const t = quoteChaseTotalsByCurrency(list)
    expect(t.AED).toMatchObject({ total: 3500.5, count: 2, '0-7': 1000, '15-30': 2500.5 })
    expect(t.USD).toMatchObject({ total: 300, count: 1, '31+': 300 })
  })
  it('filters by client, division, bucket and state', () => {
    const today = '2026-11-20'
    expect(filterQuoteChaseRows(list, { client: 'bet' }, today).map((r) => r.reference)).toEqual(['RR-03-2'])
    expect(filterQuoteChaseRows(list, { division: '03' }, today)).toHaveLength(2)
    expect(filterQuoteChaseRows(list, { bucket: '31+' }, today).map((r) => r.client)).toEqual(['Gamma'])
    expect(filterQuoteChaseRows(list, { state: 'expiring' }, today).map((r) => r.client)).toEqual(['Beta'])
    expect(filterQuoteChaseRows(list, { state: 'due' }, today).map((r) => r.client).sort()).toEqual(['Beta', 'Gamma'])
  })
  it('sorts by any column', () => {
    expect(sortQuoteChaseRows(list, 'amount', 'desc').map((r) => r.client)).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(sortQuoteChaseRows(list, 'client', 'asc').map((r) => r.client)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(sortQuoteChaseRows(list, 'valid_until', 'asc')[0].client).toBe('Beta')
  })
  it('summarises for the AI connector', () => {
    const s = quoteFollowupSummary(list, day('2026-11-20'), 2)
    expect(s.waiting).toBe(3)
    expect(s.expiring_soon.map((x) => x.reference)).toEqual(['RR-03-2'])
    expect(s.next_actions).toHaveLength(2)
    expect(s.next_actions[0]).toHaveProperty('next_action')
  })
})

describe('drafts', () => {
  const base = { stepDay: 3, reference: 'RR-01-26008', client: 'Green Cement', contactName: '', amount: 52500, currency: 'AED', validUntil: '2026-12-09', daysSinceSent: 3, companyName: 'Red Reach' }
  it('writes a follow-up, an expiry reminder and an escalation, and never sends', () => {
    const f = quoteChaseDraft({ ...base, kind: 'followup' })
    expect(f.subject).toBe('Following up: quote RR-01-26008 for Green Cement')
    expect(f.body).toContain('Dear Green Cement team,')
    expect(f.body).toContain('valid until 2026-12-09')
    expect(quoteChaseDraft({ ...base, kind: 'expiry' }).subject).toBe('Quote RR-01-26008 is valid until 2026-12-09')
    expect(quoteChaseDraft({ ...base, kind: 'escalate', daysSinceSent: 21 }).body).toContain('21 days ago')
    expect(quoteChaseDraft({ ...base, kind: 'followup', contactName: 'Vishraj' }).whatsapp.startsWith('Dear Vishraj,')).toBe(true)
  })
})
