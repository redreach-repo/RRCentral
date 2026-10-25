import { describe, expect, it } from 'vitest'
import {
  canSeeLeads,
  canSetLeadOwners,
  FORM_TOKEN_MIN_MS,
  formTokenProblem,
  leadSourceLabel,
  makeFormToken,
  matchContact,
  matchCrm,
  newLeads,
  parseLead,
  pickLeadOwner,
  whatsappRedirect,
  type IntakeRow,
} from './leadIntake'
import { buildDigest, digestSections } from './dailyDigest'

describe('parseLead', () => {
  it('keeps the fields and reads UTM values flat or nested', () => {
    const flat = parseLead({ name: ' Sara ', email: 'Sara@X.com', utm_source: 'google', utm_campaign: 'ai-crm' })
    expect('lead' in flat && flat.lead.email).toBe('sara@x.com')
    expect('lead' in flat && flat.lead.utm.source).toBe('google')
    const nested = parseLead({ name: 'Sara', phone: '050 123 4567', utm: { source: 'meta', medium: 'cpc' } })
    expect('lead' in nested && nested.lead.utm.medium).toBe('cpc')
  })

  it('sends the landing page to the AI CRM pipeline and the rest to the CRM', () => {
    const landing = parseLead({ name: 'A', email: 'a@x.com', channel: 'landing_page' })
    expect('lead' in landing && landing.lead.pipeline).toBe('ai_crm')
    const form = parseLead({ name: 'A', email: 'a@x.com' })
    expect('lead' in form && form.lead.pipeline).toBe('crm')
    expect('lead' in form && form.lead.channel).toBe('website_form')
  })

  it('needs a name and a phone or email, and flags the honeypot as spam', () => {
    expect(parseLead({ email: 'a@x.com' })).toEqual({ error: 'Give a name' })
    expect(parseLead({ name: 'A' })).toEqual({ error: 'Give a phone number or an email' })
    expect(parseLead({ name: 'A', email: 'nope' })).toEqual({ error: 'That email does not look right' })
    expect(parseLead({ name: 'A', phone: '123' })).toEqual({ error: 'That phone number looks too short' })
    expect(parseLead({ name: 'A', email: 'a@x.com', website: 'http://spam' })).toEqual({ error: 'spam', spam: true })
  })

  it('caps long values', () => {
    const r = parseLead({ name: 'x'.repeat(500), email: 'a@x.com', message: 'm'.repeat(9000) })
    expect('lead' in r && r.lead.name.length).toBe(200)
    expect('lead' in r && r.lead.message.length).toBe(5000)
  })
})

describe('leadSourceLabel', () => {
  it('names the channel and the UTM values given', () => {
    expect(leadSourceLabel({ channel: 'whatsapp', utm: { source: '', medium: '', campaign: '', term: '', content: '' } })).toBe('WhatsApp')
    expect(
      leadSourceLabel({ channel: 'landing_page', utm: { source: 'google', medium: 'cpc', campaign: 'q4', term: '', content: '' } }),
    ).toBe('AI CRM landing page, google / cpc, q4')
  })
})

describe('matching', () => {
  const contacts = [
    { id: 'c1', email: 'sara@x.com', phone: '', whatsapp: '' },
    { id: 'c2', email: 'other@x.com', phone: '+971 50 123 4567', whatsapp: '' },
  ]
  it('matches on phone before email', () => {
    expect(matchContact(contacts, { phone: '0501234567', email: 'sara@x.com' })?.id).toBe('c2')
    expect(matchContact(contacts, { phone: '', email: 'SARA@x.com' })?.id).toBe('c1')
    expect(matchContact(contacts, { phone: '0559999999', email: 'none@x.com' })).toBeUndefined()
  })

  it('matches CRM rows on row and contact phones, open rows first', () => {
    const rows = [
      { id: 'lost', pipeline_stage: 'Lost', mobile_number: '0501234567', office_number: '', email_phone: '' },
      { id: 'open', pipeline_stage: 'Lead', mobile_number: '', office_number: '', email_phone: '', contacts: [{ phone: '971501234567' }] },
    ]
    expect(matchCrm(rows, { phone: '+971501234567', email: '' })?.id).toBe('open')
    expect(matchCrm(rows, { phone: '', email: 'x@y.com' })).toBeUndefined()
  })
})

describe('pickLeadOwner', () => {
  it('uses the fixed owner when active', () => {
    expect(pickLeadOwner({ leadOwnerId: 'u1' }, ['u1'])).toEqual({ ownerId: 'u1', last: null })
    expect(pickLeadOwner({ leadOwnerId: 'gone' }, ['u1'])).toEqual({ ownerId: null, last: null })
  })

  it('takes turns in the pool and skips people who left', () => {
    const s = { leadOwnerMode: 'round_robin', leadOwnerPool: 'u1,u2,u3', leadOwnerLast: 'u1' }
    expect(pickLeadOwner(s, ['u1', 'u2', 'u3']).ownerId).toBe('u2')
    expect(pickLeadOwner({ ...s, leadOwnerLast: 'u3' }, ['u1', 'u2', 'u3']).ownerId).toBe('u1')
    expect(pickLeadOwner(s, ['u1', 'u3']).ownerId).toBe('u3')
  })

  it('falls back to the fixed owner when the pool is empty', () => {
    expect(pickLeadOwner({ leadOwnerMode: 'round_robin', leadOwnerPool: '', leadOwnerId: 'u1' }, ['u1']).ownerId).toBe('u1')
  })
})

describe('form tokens', () => {
  it('accepts a token from 3 seconds to 2 hours old, signed with the secret', async () => {
    const issued = new Date('2026-10-25T10:00:00Z')
    const token = await makeFormToken('s3cret', issued)
    expect(await formTokenProblem(token, 's3cret', new Date(issued.getTime() + FORM_TOKEN_MIN_MS + 1))).toBeNull()
    expect(await formTokenProblem(token, 's3cret', new Date(issued.getTime() + 1000))).toBe('Sent too fast')
    expect(await formTokenProblem(token, 's3cret', new Date(issued.getTime() + 3 * 60 * 60 * 1000))).toMatch(/expired/)
    expect(await formTokenProblem(token, 'other', new Date(issued.getTime() + 10_000))).toBe('Form token not valid')
    expect(await formTokenProblem('', 's3cret')).toBe('No form token')
  })
})

describe('whatsappRedirect', () => {
  it('only opens the configured number', () => {
    expect(whatsappRedirect({}, 'Hi')).toBe('https://wa.me/971507008977?text=Hi')
    expect(whatsappRedirect({ leadWhatsappNumber: '+971 55 000 0000' }, '')).toBe('https://wa.me/971550000000')
  })
})

const row = (over: Partial<IntakeRow>): IntakeRow => ({
  id: 'i1',
  name: 'Sara',
  email: 'sara@x.com',
  phone: '',
  source: 'Website form',
  channel: 'website_form',
  status: 'converted',
  pipeline: 'crm',
  account_id: null,
  crm_id: 'crm1',
  deal_id: '',
  matched: false,
  created_at: '2026-10-25T08:00:00.000Z',
  ...over,
})

describe('newLeads', () => {
  it('lists leads in the window, newest first, without WhatsApp clicks', () => {
    const since = new Date('2026-10-24T09:00:00Z')
    const list = newLeads(
      [
        row({ id: 'old', created_at: '2026-10-20T08:00:00.000Z' }),
        row({ id: 'click', status: 'click' }),
        row({ id: 'acct', account_id: 'a1', matched: true, created_at: '2026-10-25T09:00:00.000Z' }),
        row({ id: 'crm' }),
      ],
      since,
    )
    expect(list.map((l) => l.id)).toEqual(['acct', 'crm'])
    expect(list[0]).toMatchObject({ link: '/accounts/a1', detail: 'Website form, known contact' })
    expect(list[1].link).toBe('/crm?edit=crm1')
  })

  it('shows in the digest only when there are any', () => {
    const base = { now: new Date('2026-10-25T10:00:00Z'), accounts: [], contracts: [], packages: [], entries: [], tickets: [], deals: [] }
    expect(digestSections(buildDigest(base)).some((s) => s.key === 'newLeads')).toBe(false)
    const d = buildDigest({ ...base, leads: [row({})] })
    const section = digestSections(d).find((s) => s.key === 'newLeads')
    expect(section?.items[0]).toMatchObject({ name: 'Sara', path: '/crm?edit=crm1' })
  })
})

describe('who sees and sets leads', () => {
  it.each([
    ['admin', true, true],
    ['manager', true, true],
    ['sales', true, false],
    ['staff', false, false],
    ['viewer', false, false],
  ])('%s: sees %s, sets owners %s', (role, sees, sets) => {
    expect(canSeeLeads(role)).toBe(sees)
    expect(canSetLeadOwners(role)).toBe(sets)
  })
})
