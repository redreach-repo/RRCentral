/**
 * Default + clause-tag obligations to open when a legal document is signed.
 * Used by the legal-sign Edge Function and unit-tested in the app.
 */

import { clauseKeysFromText } from './clauseCompose'

export type SpawnObligationInput = {
  company_name: string
  crm_id: string
  legal_document_id: string
  doc_type: string
  signed_at: string
  created_by?: string
  /** Optional template markdown; `<!-- rr-clause:key -->` markers add keyed duties. */
  template_body?: string
  /** Explicit keys (tests / callers that already scanned the template). */
  clause_keys?: string[]
}

export type SpawnObligationRow = {
  company_name: string
  crm_id: string
  legal_document_id: string
  title: string
  description: string
  owner_party: 'red_reach' | 'counterparty' | 'both'
  due_date: string | null
  status: 'open'
  completed_at: null
  created_by: string
}

type ClauseSpawnRule = {
  title: string
  description: (company: string) => string
  owner_party: SpawnObligationRow['owner_party']
  due_days: number | null
}

/** Seeded / known clause keys → follow-through duties. */
export const CLAUSE_SPAWN_RULES: Record<string, ClauseSpawnRule> = {
  confidentiality_def: {
    title: 'Confirm Confidential Information scope',
    description: (company) => `Confirm what counts as Confidential Information under the signed document for ${company}.`,
    owner_party: 'both',
    due_days: 7,
  },
  recipient_obligations: {
    title: 'Brief team on recipient duties',
    description: (company) => `Ensure staff handling ${company} materials follow recipient confidentiality duties.`,
    owner_party: 'red_reach',
    due_days: 7,
  },
  term_survive: {
    title: 'Diary confidentiality survival end',
    description: (company) => `Record the survival period end date for confidentiality duties with ${company}.`,
    owner_party: 'red_reach',
    due_days: 30,
  },
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function baseFields(input: SpawnObligationInput) {
  const company = (input.company_name || '').trim() || 'Client'
  const created_by = (input.created_by || 'legal-sign').trim() || 'legal-sign'
  return {
    company_name: company,
    crm_id: input.crm_id || '',
    legal_document_id: input.legal_document_id,
    status: 'open' as const,
    completed_at: null,
    created_by,
    company,
  }
}

function defaultRows(input: SpawnObligationInput, base: ReturnType<typeof baseFields>): SpawnObligationRow[] {
  const { company, ...rowBase } = base
  if (input.doc_type === 'service_agreement') {
    return [
      {
        ...rowBase,
        title: 'Confirm commercial start / kickoff',
        description: `Follow up after signed service agreement for ${company}.`,
        owner_party: 'both',
        due_date: addDaysIso(input.signed_at, 14),
      },
    ]
  }

  return [
    {
      ...rowBase,
      title: 'Protect Confidential Information',
      description: `Ongoing duty under the signed ${input.doc_type === 'nda' ? 'NDA' : 'document'} for ${company}.`,
      owner_party: 'counterparty',
      due_date: null,
    },
    {
      ...rowBase,
      title: 'Return or destroy materials on request',
      description: `Track return/destruction requests for ${company} confidential materials.`,
      owner_party: 'counterparty',
      due_date: null,
    },
  ]
}

/** Pure: obligation rows for matched clause keys (unknown keys ignored). */
export function obligationsFromClauseKeys(
  keys: string[],
  input: SpawnObligationInput,
): SpawnObligationRow[] {
  const base = baseFields(input)
  const { company, ...rowBase } = base
  const out: SpawnObligationRow[] = []
  const seen = new Set<string>()
  for (const raw of keys) {
    const key = raw.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    const rule = CLAUSE_SPAWN_RULES[key]
    if (!rule) continue
    out.push({
      ...rowBase,
      title: rule.title,
      description: rule.description(company),
      owner_party: rule.owner_party,
      due_date: rule.due_days == null ? null : addDaysIso(input.signed_at, rule.due_days),
    })
  }
  return out
}

/** Pure: returns open obligation rows to insert after a successful sign. */
export function defaultObligationsOnSign(input: SpawnObligationInput): SpawnObligationRow[] {
  const base = baseFields(input)
  const keys = [
    ...(input.clause_keys || []),
    ...clauseKeysFromText(input.template_body || ''),
  ]
  const fromClauses = obligationsFromClauseKeys(keys, input)
  const defaults = defaultRows(input, base)

  // Prefer clause-tagged rows when titles collide with defaults.
  const titles = new Set(fromClauses.map((r) => r.title))
  return [...fromClauses, ...defaults.filter((r) => !titles.has(r.title))]
}
