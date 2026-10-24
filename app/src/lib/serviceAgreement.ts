/**
 * Service agreement generator: the agreement template (approved once by a
 * lawyer) filled in from a client's contract record, package and rates.
 *
 * Templates are plain text with {{placeholders}}. A line starting "# " is
 * the title, "## " a heading, "- " a bullet, and a line that is just
 * [signatures] becomes the two signature blocks. Only pure code here; the
 * PDF is drawn in serviceAgreementPdf.ts.
 */
import { format, parseISO } from 'date-fns'
import {
  CONTRACT_TERM_MONTHS,
  DEFAULT_PACKAGES,
  VAT_RATE,
  earlyExitFee,
  effectiveMonthlyFee,
  termEndFromStart,
  type DeliveryRates,
} from './delivery'
import { formatAED } from './money'
import type { Account, AccountContact, AgreementTemplate, Contract, DeliveryPackage } from './types'

export const AGREEMENT_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'agreement_reference', label: 'Agreement reference, from the client reference and start date' },
  { key: 'agreement_date', label: 'Date the agreement is made' },
  { key: 'company_name', label: 'Our company name (Settings)' },
  { key: 'company_address', label: 'Our address (Settings)' },
  { key: 'company_trn', label: 'Our TRN (Settings)' },
  { key: 'company_email', label: 'Our email (Settings)' },
  { key: 'client_name', label: 'Client name' },
  { key: 'client_reference', label: 'Client reference, e.g. AC-07-26001' },
  { key: 'client_address', label: 'Client city and country' },
  { key: 'client_signatory', label: 'Client primary contact' },
  { key: 'package_name', label: 'Package name' },
  { key: 'option', label: 'Payment option, A or B' },
  { key: 'option_description', label: 'What the option means' },
  { key: 'monthly_fee', label: 'Monthly fee before any discount' },
  { key: 'vat_rate', label: 'VAT rate' },
  { key: 'discount_terms', label: 'Sentence about any discount' },
  { key: 'setup_fee_terms', label: 'Sentence about the setup fee' },
  { key: 'billing_terms', label: 'Monthly or yearly billing' },
  { key: 'term_start', label: 'Term start date' },
  { key: 'term_end', label: 'Term end date' },
  { key: 'term_months', label: 'Term length in months' },
  { key: 'included_whatsapp', label: 'WhatsApp conversations included each month' },
  { key: 'ai_terms', label: 'Sentence about the AI usage cap' },
  { key: 'lead_terms', label: 'Sentence about included lead data credits' },
  { key: 'support_response', label: 'Support response time' },
  { key: 'marketing_rate', label: 'Price per extra marketing conversation' },
  { key: 'service_rate', label: 'Price per extra service conversation' },
  { key: 'ai_markup', label: 'Markup on AI usage above the cap' },
  { key: 'lead_markup', label: 'Markup on extra lead data credits' },
  { key: 'exit_fee', label: 'Early exit fee' },
  { key: 'exit_fee_breakdown', label: 'How the early exit fee is worked out' },
]

const KNOWN = new Set(AGREEMENT_PLACEHOLDERS.map((p) => p.key))

/** Placeholders the roadmap says every agreement must carry. */
export const REQUIRED_PLACEHOLDERS = ['included_whatsapp', 'ai_terms', 'exit_fee']

export const DEFAULT_AGREEMENT_TITLE = 'Service agreement'

/** Starter wording for the lawyer to review. Not legal advice until approved. */
export const DEFAULT_AGREEMENT_BODY = `# Service Agreement

Agreement reference: {{agreement_reference}}
Date: {{agreement_date}}

## Parties
This agreement is between {{company_name}}, of {{company_address}}, TRN {{company_trn}} (the Provider), and {{client_name}}, of {{client_address}}, client reference {{client_reference}} (the Client).

## 1. The service
The Provider will build, host and support an AI CRM system for the Client on the {{package_name}} package, payment option {{option}} ({{option_description}}).
The work included is set out in the requirements the Client signs off. Anything outside them is a change request, quoted and agreed in writing before work starts.

## 2. Term
This agreement starts on {{term_start}} and runs for {{term_months}} months, until {{term_end}}.
After that it continues month to month until either party gives 30 days written notice, unless both parties sign a new term.

## 3. Fees and payment
- Monthly fee: {{monthly_fee}} plus VAT at {{vat_rate}}.
- {{discount_terms}}
- {{setup_fee_terms}}
- {{billing_terms}}
- Invoices are payable within 7 days of the invoice date. The Provider may pause the service if an invoice is more than 30 days overdue, after giving 7 days written notice.

## 4. What is included each month
- WhatsApp conversations: {{included_whatsapp}} each month, shared across marketing, service and utility conversations. Marketing conversations use the allowance first.
- AI usage: {{ai_terms}}
- Lead data: {{lead_terms}}
- Support: a first reply within {{support_response}}.
Unused allowance does not carry over to the next month.

## 5. Usage above the monthly caps
Usage above the caps is invoiced the following month, plus VAT:
- Marketing conversations above the allowance: {{marketing_rate}} each.
- Service and utility conversations above the allowance: {{service_rate}} each.
- AI usage above the cap: at cost plus {{ai_markup}}.
- Lead data credits above the included amount: at cost plus {{lead_markup}}.
The Client can see usage against these caps in the client portal and the monthly report.

## 6. Ending early
If the Client ends this agreement before {{term_end}}, an early exit fee of {{exit_fee}} plus VAT is due. This is {{exit_fee_breakdown}}.
Fees already invoiced stay payable. Either party may end this agreement straight away by written notice if the other commits a serious breach and does not put it right within 30 days of being asked to in writing.

## 7. Data protection
- The Client controls the personal data it puts into the system, such as its customers' names, phone numbers and messages. The Provider processes that data only to provide the service and only on the Client's documented instructions.
- Both parties will comply with UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data and any other data protection law that applies to them.
- The Provider keeps the data secure with access controls, role based permissions, encryption in transit and regular backups, and makes sure everyone who handles it is bound by confidentiality.
- The Provider uses these sub-processors: Supabase (database hosting), Meta (WhatsApp Business Platform) and Anthropic (AI features). The Provider will tell the Client before adding or replacing a sub-processor, and the Client may object.
- Where data is processed outside the UAE, the Provider will make sure appropriate safeguards are in place.
- The Provider will tell the Client without undue delay, and within 72 hours, after becoming aware of a breach affecting the Client's personal data.
- The Provider will help the Client answer requests from people exercising their data rights.
- When this agreement ends, the Provider will give the Client a full export of its data in a standard format and then delete it within 30 days, unless the law requires it to be kept.

## 8. Confidentiality
Each party will keep the other's confidential information private and use it only for this agreement. This continues for 2 years after the agreement ends.

## 9. Liability
Neither party is liable for indirect or consequential loss. Each party's total liability under this agreement is limited to the fees paid in the 12 months before the claim, except for unpaid fees, breach of confidentiality or breach of the data protection terms.

## 10. Governing law
This agreement is governed by the laws of the Emirate of Dubai and the federal laws of the United Arab Emirates. The courts of Dubai have jurisdiction over any dispute.

[signatures]`

export type AgreementInput = {
  contract: Contract
  pkg: DeliveryPackage | null
  account: Pick<Account, 'name' | 'reference' | 'city' | 'country'>
  contact: Pick<AccountContact, 'name' | 'role'> | null
  settings: Record<string, string | undefined>
  rates: DeliveryRates
  today?: Date
}

const day = (iso: string | null | undefined) => {
  if (!iso) return 'the date both parties sign'
  try {
    return format(parseISO(iso), 'd MMMM yyyy')
  } catch {
    return iso
  }
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const pct = (n: number) => `${Number(num(n).toFixed(2))}%`
const usd = (n: number) => `USD ${num(n).toFixed(2)}`
const aed = (n: number) => formatAED(num(n))

/** Every placeholder's value for one contract. Missing details become plain words, never blanks. */
export function agreementValues(input: AgreementInput): Record<string, string> {
  const { contract, pkg, account, contact, settings, rates } = input
  const today = input.today ?? new Date()
  const monthly = num(contract.monthly_fee)
  const effective = effectiveMonthlyFee(contract)
  const unpaidSetup = Math.max(0, num(contract.setup_fee) - num(contract.setup_fee_paid))
  const optionB = contract.option === 'B'

  const discount =
    num(contract.discount_percent) > 0 && num(contract.discount_months_left) > 0
      ? `A discount of ${pct(contract.discount_percent)} applies for the first ${num(contract.discount_months_left)} ${
          num(contract.discount_months_left) === 1 ? 'month' : 'months'
        }, so those months cost ${aed(effective)} plus VAT.`
      : 'No discount applies.'

  const setup =
    num(contract.setup_fee) > 0
      ? `A one off setup fee of ${aed(contract.setup_fee)} plus VAT${
          num(contract.setup_fee_paid) > 0 ? `, of which ${aed(contract.setup_fee_paid)} has been paid` : ''
        }, invoiced at the start of the build.`
      : 'There is no setup fee.'

  const exitParts = [`two months of the monthly fee (2 x ${aed(monthly)})`]
  if (unpaidSetup > 0) exitParts.push(`the unpaid setup fee of ${aed(unpaidSetup)}`)

  const signatory = contact?.name ? `${contact.name}${contact.role ? `, ${contact.role}` : ''}` : ''
  const ref = account.reference || 'RR'
  const start = contract.term_start || format(today, 'yyyy-MM-dd')

  return {
    agreement_reference: `SA-${ref}-${start.replace(/-/g, '').slice(0, 8)}`,
    agreement_date: format(today, 'd MMMM yyyy'),
    company_name: settings.companyName || 'Red Reach',
    company_address: settings.address || 'the address on its invoices',
    company_trn: settings.trn || 'not registered',
    company_email: settings.email || '',
    client_name: account.name || 'the Client',
    client_reference: account.reference || 'not set',
    client_address: [account.city, account.country].filter(Boolean).join(', ') || 'the address on its invoices',
    client_signatory: signatory,
    package_name: pkg?.name ?? 'custom',
    option: contract.option,
    option_description: optionB
      ? 'a setup fee and a lower monthly fee'
      : 'a monthly fee with no setup fee',
    monthly_fee: aed(monthly),
    vat_rate: pct(VAT_RATE * 100),
    discount_terms: discount,
    setup_fee_terms: setup,
    billing_terms: contract.annual_prepay
      ? 'The monthly fees for the year are invoiced together, in advance, at the start of the term.'
      : 'The monthly fee is invoiced monthly, in advance.',
    term_start: day(contract.term_start),
    term_end: day(contract.term_end),
    term_months: String(CONTRACT_TERM_MONTHS),
    included_whatsapp: pkg ? num(pkg.included_whatsapp).toLocaleString('en-AE') : 'none',
    ai_terms:
      pkg?.ai_cap_usd == null
        ? 'included, with no monthly cap.'
        : `up to ${usd(pkg.ai_cap_usd)} each month.`,
    lead_terms:
      pkg?.included_lead_credits_usd == null || num(pkg.included_lead_credits_usd) <= 0
        ? 'none included. Any lead data the Client asks for is charged as below.'
        : `credits up to ${usd(pkg.included_lead_credits_usd)} each month.`,
    support_response: pkg?.support_response || 'as agreed in writing',
    marketing_rate: aed(rates.marketingRateAed),
    service_rate: aed(rates.serviceRateAed),
    ai_markup: pct(rates.aiMarkupPercent),
    lead_markup: pct(rates.leadMarkupPercent),
    exit_fee: aed(earlyExitFee(contract)),
    exit_fee_breakdown: exitParts.join(' plus '),
  }
}

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g

/** Placeholders in a template that RR Central does not know, and required ones it leaves out. */
export function checkTemplate(body: string): { unknown: string[]; missing: string[] } {
  const used = new Set<string>()
  for (const m of body.matchAll(PLACEHOLDER)) used.add(m[1])
  // Anything in braces that is not a valid placeholder name, such as {{Client Name}}.
  const odd = [...body.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1].trim()).filter((k) => !/^[a-z_]+$/.test(k))
  return {
    unknown: [...new Set([...[...used].filter((k) => !KNOWN.has(k)), ...odd])],
    missing: REQUIRED_PLACEHOLDERS.filter((k) => !used.has(k)),
  }
}

/** Put the values into the template. Unknown placeholders stay as typed so they are easy to spot. */
export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(PLACEHOLDER, (whole, key: string) => (key in values ? values[key] : whole))
}

export type AgreementBlock =
  | { kind: 'title' | 'heading' | 'paragraph' | 'bullet'; text: string }
  | { kind: 'signatures' }

/** Split filled text into blocks for the PDF and the preview. Blank lines and empty bullets are dropped. */
export function agreementBlocks(text: string): AgreementBlock[] {
  const out: AgreementBlock[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || line === '-' || line === '*') continue
    if (line.toLowerCase() === '[signatures]') out.push({ kind: 'signatures' })
    else if (line.startsWith('## ')) out.push({ kind: 'heading', text: line.slice(3).trim() })
    else if (line.startsWith('# ')) out.push({ kind: 'title', text: line.slice(2).trim() })
    else if (/^[-*] /.test(line)) {
      const t = line.slice(2).trim()
      if (t) out.push({ kind: 'bullet', text: t })
    } else out.push({ kind: 'paragraph', text: line })
  }
  return out
}

/** The template to use for agreements: the approved one, or else the newest draft. */
export function templateInUse(templates: AgreementTemplate[]): AgreementTemplate | null {
  const approved = templates.find((t) => t.status === 'approved')
  if (approved) return approved
  const drafts = templates.filter((t) => t.status === 'draft').sort((a, b) => b.version - a.version)
  return drafts[0] ?? null
}

/** Next version number. */
export function nextVersion(templates: Pick<AgreementTemplate, 'version'>[]): number {
  return templates.reduce((max, t) => Math.max(max, num(t.version)), 0) + 1
}

/** Footer line saying which template made the PDF. */
export function templateFooter(t: Pick<AgreementTemplate, 'version' | 'status' | 'approved_by' | 'approved_at'> | null): string {
  if (!t) return 'Starter template, not yet approved by a lawyer'
  if (t.status === 'draft') return `Template version ${t.version}, draft, not yet approved by a lawyer`
  return `Template version ${t.version}, approved by ${t.approved_by}${t.approved_at ? ` on ${day(t.approved_at)}` : ''}`
}

/** File name for the PDF, e.g. Service-agreement-AC-07-26001-Smile-Dental.pdf */
export function agreementFileName(account: Pick<Account, 'name' | 'reference'>): string {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `Service-agreement-${[slug(account.reference || ''), slug(account.name || '')].filter(Boolean).join('-') || 'client'}.pdf`
}

/** Everything the PDF needs, from a template (or the starter wording when none is saved yet). */
export function buildAgreement(template: AgreementTemplate | null, input: AgreementInput, bodyOverride?: string) {
  const values = agreementValues(input)
  const body = bodyOverride ?? (template?.body || DEFAULT_AGREEMENT_BODY)
  return {
    values,
    blocks: agreementBlocks(fillTemplate(body, values)),
    footer: templateFooter(template),
    draft: !template || template.status !== 'approved',
  }
}

/** A made up client on the Growth package, option B, for previewing the template. */
export function sampleAgreementInput(
  settings: Record<string, string | undefined>,
  rates: DeliveryRates,
  today: Date = new Date(),
): AgreementInput {
  const pkg = DEFAULT_PACKAGES.find((p) => p.code === 'growth') ?? DEFAULT_PACKAGES[0]
  const start = format(today, 'yyyy-MM-01')
  return {
    contract: {
      id: 'sample',
      account_id: 'sample',
      package_id: 'sample',
      option: 'B',
      monthly_fee: pkg.monthly_fee_b,
      setup_fee: pkg.setup_fee_b,
      setup_fee_paid: 0,
      term_start: start,
      term_end: termEndFromStart(start),
      discount_percent: 10,
      discount_months_left: 3,
      annual_prepay: false,
      status: 'active',
      notes: '',
      created_at: today.toISOString(),
      updated_at: today.toISOString(),
    },
    pkg: { ...pkg, id: 'sample', updated_at: today.toISOString() },
    account: { name: 'Sample Dental Clinic', reference: 'AC-07-26001', city: 'Dubai', country: 'United Arab Emirates' },
    contact: { name: 'Dr Sara Khan', role: 'Clinic director' },
    settings,
    rates,
    today,
  }
}
