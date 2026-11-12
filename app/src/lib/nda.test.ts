import { describe, expect, it } from 'vitest'
import { buildNda, ndaValues, parseNdaBody, unknownPlaceholders } from './nda'
import { legalSignLink, legalSignLinkState, signProblem } from './legalDocuments'

describe('NDA template fill', () => {
  it('fills placeholders and parses signatures block', () => {
    const values = ndaValues({
      effectiveDate: '2026-11-11',
      providerName: 'Red Reach Middle East FZE',
      providerAddress: 'UAQ',
      partyCompany: 'Green Cement',
      partyName: 'Mohammad',
      partyEmail: 'a@b.ae',
    })
    expect(values.party_email_clause).toContain('a@b.ae')
    const { blocks } = buildNda(
      '# Title\nHello {{party_company}}\n[signatures]\n',
      {
        effectiveDate: '2026-11-11',
        providerName: 'RR',
        providerAddress: 'UAQ',
        partyCompany: 'Green Cement',
        partyName: 'Mohammad',
      },
    )
    expect(blocks.some((b) => b.kind === 'title')).toBe(true)
    expect(blocks.some((b) => b.kind === 'signatures')).toBe(true)
    expect(blocks.some((b) => b.kind === 'paragraph' && b.text.includes('Green Cement'))).toBe(true)
  })

  it('flags unknown placeholders', () => {
    expect(unknownPlaceholders('{{party_name}} and {{foo_bar}}')).toEqual(['foo_bar'])
  })

  it('parses bullets and headings', () => {
    const blocks = parseNdaBody('## Duties\n- Keep secret\nPlain line')
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'bullet', 'paragraph'])
  })
})

describe('legal sign validation', () => {
  it('builds a fragment sign link', () => {
    expect(legalSignLink('https://x.io/RRCentral/', 'abc')).toBe('https://x.io/RRCentral/sign#abc')
  })

  it('tracks link states', () => {
    expect(legalSignLinkState({ signed_at: '2026-01-01', revoked_at: null, expires_at: null })).toBe('signed')
    expect(legalSignLinkState({ signed_at: null, revoked_at: '2026-01-01', expires_at: null })).toBe('revoked')
    expect(
      legalSignLinkState({ signed_at: null, revoked_at: null, expires_at: '2000-01-01T00:00:00Z' }, new Date('2026-01-01')),
    ).toBe('expired')
    expect(legalSignLinkState({ signed_at: null, revoked_at: null, expires_at: null })).toBe('active')
  })

  it('requires name, date, agreement and a PNG signature', () => {
    const now = new Date('2026-11-11T12:00:00Z')
    expect(
      signProblem(
        { name: 'A', date: '2026-11-11', agreed: true, signaturePng: 'data:image/png;base64,aaaa' },
        now,
      ),
    ).toMatch(/full name/i)
    expect(
      signProblem(
        { name: 'Alex Client', date: '2026-11-11', agreed: false, signaturePng: 'data:image/png;base64,aaaa' },
        now,
      ),
    ).toMatch(/tick/i)
    expect(
      signProblem(
        { name: 'Alex Client', date: '2026-11-11', agreed: true, signaturePng: '' },
        now,
      ),
    ).toMatch(/signature/i)
    expect(
      signProblem(
        {
          name: 'Alex Client',
          date: '2026-11-11',
          agreed: true,
          signaturePng: 'data:image/png;base64,' + 'a'.repeat(100),
        },
        now,
      ),
    ).toBeNull()
  })
})
