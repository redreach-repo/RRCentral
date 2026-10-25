import { describe, expect, it } from 'vitest'
import { buildDigest, digestSections } from './dailyDigest'
import { clientUpdateDue, groupIssuesByClient, issueDetail, needsClientUpdate, openIssues, vendorStatusLabel, type IssueRow } from './ctrmIssues'

// Thursday 2026-10-22 10:00 Dubai (06:00 UTC).
const raised = '2026-10-22T06:00:00.000Z'
const issue = (over: Partial<IssueRow> = {}): IssueRow => ({
  id: 'i1',
  subject: 'Report export fails',
  account_id: 'a1',
  status: 'open',
  created_at: raised,
  channel: 'ctrm_next',
  assignee_user_id: null,
  vendor_ticket_ref: '',
  vendor_status: 'raised',
  client_updated_at: null,
  vendor_fixed_at: null,
  ...over,
})

describe('client update rule', () => {
  it('is due 2 working days after the last update, skipping the weekend', () => {
    // Thu 10:00 + 18 working hours = Mon 10:00 Dubai.
    expect(clientUpdateDue(issue()).toISOString()).toBe('2026-10-26T06:00:00.000Z')
  })
  it('flags an open issue only once that time has passed', () => {
    expect(needsClientUpdate(issue(), new Date('2026-10-26T05:00:00Z'))).toBe(false)
    expect(needsClientUpdate(issue(), new Date('2026-10-26T07:00:00Z'))).toBe(true)
    expect(needsClientUpdate(issue({ client_updated_at: '2026-10-26T05:00:00Z' }), new Date('2026-10-26T07:00:00Z'))).toBe(false)
    expect(needsClientUpdate(issue({ status: 'resolved' }), new Date('2026-11-30T07:00:00Z'))).toBe(false)
    expect(needsClientUpdate(issue({ channel: 'email' }), new Date('2026-11-30T07:00:00Z'))).toBe(false)
  })
})

describe('issue lists', () => {
  const now = new Date('2026-10-27T07:00:00Z')
  const list = [
    issue({ id: 'b-new', account_id: 'b', created_at: '2026-10-26T06:00:00Z' }),
    issue({ id: 'a-old', account_id: 'a', created_at: '2026-10-20T06:00:00Z', client_updated_at: '2026-10-27T06:00:00Z' }),
    issue({ id: 'b-old', account_id: 'b', created_at: '2026-10-19T06:00:00Z' }),
    issue({ id: 'closed', account_id: 'a', status: 'closed' }),
    issue({ id: 'mail', channel: 'email' }),
  ]
  it('lists open CTRM issues oldest first', () => {
    expect(openIssues(list).map((t) => t.id)).toEqual(['b-old', 'a-old', 'b-new'])
  })
  it('groups by client with flagged clients first', () => {
    const names: Record<string, string> = { a: 'Alpha Oil', b: 'Beta Energy' }
    const groups = groupIssuesByClient(list, (id) => names[id ?? ''] ?? '', now)
    expect(groups.map((g) => [g.name, g.issues.map((i) => i.id), g.flagged])).toEqual([
      ['Beta Energy', ['b-old', 'b-new'], 1],
      ['Alpha Oil', ['a-old', 'closed'], 0],
    ])
  })
  it('describes an issue', () => {
    expect(issueDetail(issue({ vendor_ticket_ref: 'CN-123' }), 'Alpha Oil', new Date('2026-10-27T07:00:00Z'))).toBe(
      'Alpha Oil, open 5 days, vendor: Raised (CN-123), client not updated yet',
    )
    expect(vendorStatusLabel('')).toBe('Not raised')
  })
  it('adds an open issues section to the digest', () => {
    const d = buildDigest({ now, accounts: [{ id: 'b', name: 'Beta Energy', type: 'ctrm_prospect' }], contracts: [], packages: [], entries: [], tickets: [], deals: [], ctrmIssues: list })
    expect(d.ctrmIssues?.map((i) => i.path)).toEqual(['/support/b-old', '/support/a-old', '/support/b-new'])
    expect(d.ctrmIssues?.[0]).toMatchObject({ name: 'Report export fails', urgent: true })
    expect(digestSections(d).some((s) => s.key === 'ctrmIssues')).toBe(true)
    const none = buildDigest({ now, accounts: [], contracts: [], packages: [], entries: [], tickets: [], deals: [] })
    expect(digestSections(none).some((s) => s.key === 'ctrmIssues')).toBe(false)
  })
})
