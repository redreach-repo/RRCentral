import { describe, expect, it } from 'vitest'
import {
  AGREEMENT_PLACEHOLDERS,
  DEFAULT_AGREEMENT_BODY,
  agreementBlocks,
  agreementFileName,
  agreementValues,
  buildAgreement,
  checkTemplate,
  fillTemplate,
  nextVersion,
  sampleAgreementInput,
  templateFooter,
  templateInUse,
} from './serviceAgreement'
import { DEFAULT_DELIVERY_RATES } from './delivery'
import type { AgreementTemplate } from './types'
import migrationSql from '../../../supabase/migrations/20261107100000_agreement_templates.sql?raw'

const today = new Date('2026-11-02T09:00:00Z')
const settings = { companyName: 'Red Reach Middle East FZE', address: 'Dubai, UAE', trn: '100000000000003' }

function tpl(partial: Partial<AgreementTemplate>): AgreementTemplate {
  return {
    id: crypto.randomUUID(),
    version: 1,
    title: 'Service agreement',
    body: DEFAULT_AGREEMENT_BODY,
    status: 'draft',
    approved_by: '',
    approved_at: null,
    approval_note: '',
    created_by: '',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('agreementValues', () => {
  const input = sampleAgreementInput(settings, DEFAULT_DELIVERY_RATES, today)

  it('fills fees, term, caps and the exit fee from the contract', () => {
    const v = agreementValues(input)
    expect(v.client_name).toBe('Sample Dental Clinic')
    expect(v.package_name).toBe('Growth')
    expect(v.option).toBe('B')
    expect(v.term_start).toBe('1 November 2026')
    expect(v.term_end).toBe('31 October 2027')
    expect(v.term_months).toBe('12')
    expect(v.vat_rate).toBe('5%')
    expect(v.discount_terms).toContain('10% applies for the first 3 months')
    expect(v.setup_fee_terms).toContain('AED 3,000.00')
    // Exit fee: unpaid setup 3,000 + 2 x monthly fee.
    const monthly = input.contract.monthly_fee
    expect(v.exit_fee).toBe(
      `AED ${(3000 + 2 * monthly).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    )
    expect(v.exit_fee_breakdown).toContain('the unpaid setup fee of AED 3,000.00')
    expect(v.marketing_rate).toBe('AED 0.30')
    expect(v.ai_markup).toBe('25%')
    expect(v.client_signatory).toBe('Dr Sara Khan, Clinic director')
    expect(v.agreement_reference).toBe('SA-AC-07-26001-20261101')
    expect(v.company_name).toBe('Red Reach Middle East FZE')
  })

  it('has a value for every placeholder it lists', () => {
    const v = agreementValues(input)
    for (const p of AGREEMENT_PLACEHOLDERS) expect(v[p.key], p.key).toBeTypeOf('string')
    expect(Object.keys(v).sort()).toEqual(AGREEMENT_PLACEHOLDERS.map((p) => p.key).sort())
  })

  it('uses plain words when details are missing', () => {
    const v = agreementValues({
      ...input,
      contract: {
        ...input.contract,
        option: 'A',
        setup_fee: 0,
        setup_fee_paid: 0,
        discount_percent: 0,
        discount_months_left: 0,
        term_start: null,
        term_end: null,
        annual_prepay: true,
      },
      pkg: null,
      contact: null,
      account: { name: 'Clinic', reference: '', city: '', country: '' },
      settings: {},
    })
    expect(v.setup_fee_terms).toBe('There is no setup fee.')
    expect(v.discount_terms).toBe('No discount applies.')
    expect(v.term_start).toBe('the date both parties sign')
    expect(v.package_name).toBe('custom')
    expect(v.ai_terms).toBe('included, with no monthly cap.')
    expect(v.billing_terms).toContain('in advance, at the start of the term')
    expect(v.exit_fee_breakdown).not.toContain('setup')
    expect(v.client_address).toBe('the address on its invoices')
    expect(v.company_name).toBe('Red Reach')
  })

  it('states the AI cap and lead credits when the package has them', () => {
    const v = agreementValues({ ...input, pkg: { ...input.pkg!, ai_cap_usd: 40, included_lead_credits_usd: 25 } })
    expect(v.ai_terms).toBe('up to USD 40.00 each month.')
    expect(v.lead_terms).toBe('credits up to USD 25.00 each month.')
  })
})

describe('template text', () => {
  it('the starter wording uses only known placeholders and carries the required ones', () => {
    expect(checkTemplate(DEFAULT_AGREEMENT_BODY)).toEqual({ unknown: [], missing: [] })
  })

  it('the starter wording has no em or en dashes', () => {
    expect(DEFAULT_AGREEMENT_BODY).not.toMatch(/[–—]/)
  })

  it('flags unknown and badly typed placeholders, and missing caps or exit fee', () => {
    const r = checkTemplate('Hello {{client_nme}} and {{Client Name}}. Fee {{monthly_fee}}.')
    expect(r.unknown).toEqual(['client_nme', 'Client Name'])
    expect(r.missing).toEqual(['included_whatsapp', 'ai_terms', 'exit_fee'])
  })

  it('fills known placeholders and leaves unknown ones visible', () => {
    expect(fillTemplate('{{ a }} {{b}} {{c}}', { a: '1', b: '2' })).toBe('1 2 {{c}}')
  })

  it('splits into title, headings, bullets, paragraphs and signatures', () => {
    const blocks = agreementBlocks('# Title\r\n\n## 1. One\nText\n- point\n-  \n[signatures]')
    expect(blocks).toEqual([
      { kind: 'title', text: 'Title' },
      { kind: 'heading', text: '1. One' },
      { kind: 'paragraph', text: 'Text' },
      { kind: 'bullet', text: 'point' },
      { kind: 'signatures' },
    ])
  })

  it('a filled starter agreement has no placeholders left and covers data protection', () => {
    const doc = buildAgreement(null, sampleAgreementInput(settings, DEFAULT_DELIVERY_RATES, today))
    const text = doc.blocks.map((b) => ('text' in b ? b.text : '')).join('\n')
    expect(text).not.toContain('{{')
    expect(text).toContain('Federal Decree-Law No. 45 of 2021')
    expect(text).toContain('early exit fee of AED')
    expect(doc.blocks.at(-1)).toEqual({ kind: 'signatures' })
    expect(doc.draft).toBe(true)
  })

  it('uses an edited body when given one', () => {
    const doc = buildAgreement(tpl({}), sampleAgreementInput(settings, DEFAULT_DELIVERY_RATES, today), '# Hi {{client_name}}')
    expect(doc.blocks).toEqual([{ kind: 'title', text: 'Hi Sample Dental Clinic' }])
  })
})

describe('versions', () => {
  it('uses the approved version, else the newest draft', () => {
    const a = tpl({ version: 1, status: 'retired', approved_by: 'X', approved_at: '2026-10-01T00:00:00Z' })
    const b = tpl({ version: 2, status: 'approved', approved_by: 'Layla Haddad', approved_at: '2026-11-03T12:00:00Z' })
    const c = tpl({ version: 3 })
    expect(templateInUse([a, b, c])?.version).toBe(2)
    expect(templateInUse([a, c, tpl({ version: 4 })])?.version).toBe(4)
    expect(templateInUse([a])).toBeNull()
    expect(nextVersion([a, b, c])).toBe(4)
    expect(nextVersion([])).toBe(1)
  })

  it('says on the PDF which version made it and who approved it', () => {
    expect(templateFooter(null)).toBe('Starter template, not yet approved by a lawyer')
    expect(templateFooter(tpl({ version: 3 }))).toBe('Template version 3, draft, not yet approved by a lawyer')
    expect(
      templateFooter(tpl({ version: 2, status: 'approved', approved_by: 'Layla Haddad', approved_at: '2026-11-03T12:00:00Z' })),
    ).toBe('Template version 2, approved by Layla Haddad on 3 November 2026')
    const doc = buildAgreement(
      tpl({ status: 'approved', approved_by: 'L', approved_at: '2026-11-03T12:00:00Z' }),
      sampleAgreementInput(settings, DEFAULT_DELIVERY_RATES, today),
    )
    expect(doc.draft).toBe(false)
  })

  it('names the file after the client', () => {
    expect(agreementFileName({ name: 'Smile & Co Dental', reference: 'AC-07-26001' })).toBe(
      'Service-agreement-AC-07-26001-Smile-Co-Dental.pdf',
    )
    expect(agreementFileName({ name: '', reference: '' })).toBe('Service-agreement-client.pdf')
  })
})

describe('migration', () => {
  it('locks approved wording, keeps one approved version and uses the usual policies', () => {
    expect(migrationSql).toContain('create table if not exists public.agreement_templates')
    expect(migrationSql).toContain("where status = 'approved'")
    expect(migrationSql).toContain('before update or delete on public.agreement_templates')
    expect(migrationSql).toContain('drop policy if exists "Staff full access" on public.agreement_templates')
    expect(migrationSql).toContain('public.rr_is_manager_or_admin()')
    expect(migrationSql).toContain('To reverse')
  })
})
