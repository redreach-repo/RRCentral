/**
 * NDA wording: placeholders filled from company + party, then drawn as a PDF.
 * Shared by the app and (via tests) the legal-sign flow. Pure code only.
 */

export const DEFAULT_NDA_TITLE = 'Non-disclosure agreement'

export const NDA_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'effective_date', label: 'Effective date' },
  { key: 'provider_name', label: 'Red Reach legal name' },
  { key: 'provider_address', label: 'Red Reach address' },
  { key: 'party_company', label: 'Client company' },
  { key: 'party_name', label: 'Client signatory' },
  { key: 'party_email_clause', label: 'Email clause (auto)' },
  { key: 'term_years', label: 'Agreement term (years)' },
  { key: 'survive_years', label: 'Confidentiality survival (years)' },
  { key: 'governing_law', label: 'Governing law' },
  { key: 'governing_courts', label: 'Courts' },
]

export const DEFAULT_NDA_BODY = `# Non-disclosure agreement

This Non-Disclosure Agreement ("Agreement") is entered into as of {{effective_date}} between:

**Disclosing party:** {{provider_name}} ("Red Reach"), of {{provider_address}}.

**Receiving party:** {{party_company}} ("Recipient"), represented by {{party_name}}{{party_email_clause}}.

## 1. Purpose
The parties wish to explore a possible business relationship regarding uniforms, merchandise, or related services. In that discussion, Red Reach may share confidential commercial information with the Recipient.

## 2. Confidential information
"Confidential Information" means non-public information disclosed by Red Reach, including pricing, quotations, designs, artwork, client lists, manufacturing details, and business plans, whether written, oral, or electronic. It does not include information that (a) is or becomes public other than by breach of this Agreement, (b) was already known to the Recipient without duty of confidence, (c) is independently developed without use of Confidential Information, or (d) is required to be disclosed by law (with prior notice to Red Reach where legally allowed).

## 3. Obligations
The Recipient shall:
- use Confidential Information only for evaluating or performing the contemplated work with Red Reach;
- not disclose it to third parties without Red Reach's prior written consent, except to employees or advisers who need it and are bound by similar duties;
- protect it with at least reasonable care;
- return or destroy Confidential Information on Red Reach's written request, except for copies retained under legal hold.

## 4. Term
This Agreement starts on {{effective_date}} and continues for {{term_years}} years, unless ended earlier in writing. Confidentiality obligations survive for {{survive_years}} years after disclosure of the relevant information.

## 5. No licence
Nothing in this Agreement grants a licence to any intellectual property of Red Reach.

## 6. Governing law
This Agreement is governed by the laws of the {{governing_law}}. The courts of {{governing_courts}} have non-exclusive jurisdiction.

## 7. Entire agreement
This Agreement is the entire understanding on confidentiality for the purpose above and may be signed in counterparts (including electronic signature).

[signatures]
`

export type NdaFillInput = {
  effectiveDate: string
  providerName: string
  providerAddress: string
  partyCompany: string
  partyName: string
  partyEmail?: string
  termYears?: number
  surviveYears?: number
  governingLaw?: string
  governingCourts?: string
}

export type NdaBlock =
  | { kind: 'title' | 'heading' | 'paragraph' | 'bullet'; text: string }
  | { kind: 'signatures' }

export function nextNdaVersion(templates: { version: number }[]): number {
  return Math.max(0, ...templates.map((t) => t.version)) + 1
}

export function templateInUse<T extends { status: string }>(templates: T[]): T | null {
  return templates.find((t) => t.status === 'approved') || null
}

export function ndaFooter(t: {
  version: number
  status: string
  approved_by: string
  approved_at: string | null
} | null): string {
  if (!t) return 'NDA template not approved'
  if (t.status === 'approved') {
    const when = t.approved_at ? String(t.approved_at).slice(0, 10) : ''
    return `NDA template v${t.version} · approved by ${t.approved_by}${when ? ` on ${when}` : ''}`
  }
  return `NDA template v${t.version} · DRAFT (not lawyer-approved)`
}

function fill(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => values[key] ?? `{{${key}}}`)
}

export function ndaValues(input: NdaFillInput): Record<string, string> {
  const email = (input.partyEmail || '').trim()
  return {
    effective_date: input.effectiveDate.slice(0, 10) || '—',
    provider_name: input.providerName.trim() || 'Red Reach Middle East FZE',
    provider_address: input.providerAddress.trim() || 'Umm Al Quwain, UAE',
    party_company: input.partyCompany.trim() || 'the Recipient',
    party_name: input.partyName.trim() || 'Authorised signatory',
    party_email_clause: email ? ` (${email})` : '',
    term_years: String(input.termYears ?? 2),
    survive_years: String(input.surviveYears ?? 3),
    governing_law: input.governingLaw?.trim() || 'United Arab Emirates',
    governing_courts: input.governingCourts?.trim() || 'the UAE',
  }
}

/** Parse markdown-ish NDA body into draw blocks (same conventions as service agreements). */
export function parseNdaBody(body: string): NdaBlock[] {
  const blocks: NdaBlock[] = []
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (!t) continue
    if (/^\[signatures\]$/i.test(t)) {
      blocks.push({ kind: 'signatures' })
      continue
    }
    if (t.startsWith('### ')) blocks.push({ kind: 'heading', text: t.slice(4).trim() })
    else if (t.startsWith('## ')) blocks.push({ kind: 'heading', text: t.slice(3).trim() })
    else if (t.startsWith('# ')) blocks.push({ kind: 'title', text: t.slice(2).trim() })
    else if (t.startsWith('- ')) blocks.push({ kind: 'bullet', text: t.slice(2).trim() })
    else blocks.push({ kind: 'paragraph', text: t.replace(/\*\*/g, '') })
  }
  return blocks
}

export function buildNda(
  templateBody: string | null | undefined,
  input: NdaFillInput,
  bodyOverride?: string,
): { blocks: NdaBlock[]; draftWarning: boolean } {
  const body = (bodyOverride ?? templateBody ?? DEFAULT_NDA_BODY).trim() || DEFAULT_NDA_BODY
  const filled = fill(body, ndaValues(input))
  return { blocks: parseNdaBody(filled), draftWarning: false }
}

export function unknownPlaceholders(body: string): string[] {
  const known = new Set(NDA_PLACEHOLDERS.map((p) => p.key))
  const found = new Set<string>()
  for (const m of body.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    const key = m[1].toLowerCase()
    if (!known.has(key)) found.add(key)
  }
  return [...found].sort()
}
