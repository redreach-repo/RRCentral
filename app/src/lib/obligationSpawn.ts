/**
 * Default obligations to open when a legal document is signed.
 * Used by the legal-sign Edge Function and unit-tested in the app.
 */

export type SpawnObligationInput = {
  company_name: string
  crm_id: string
  legal_document_id: string
  doc_type: string
  signed_at: string
  created_by?: string
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

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Pure: returns open obligation rows to insert after a successful sign. */
export function defaultObligationsOnSign(input: SpawnObligationInput): SpawnObligationRow[] {
  const company = (input.company_name || '').trim() || 'Client'
  const created_by = (input.created_by || 'legal-sign').trim() || 'legal-sign'
  const base = {
    company_name: company,
    crm_id: input.crm_id || '',
    legal_document_id: input.legal_document_id,
    status: 'open' as const,
    completed_at: null,
    created_by,
  }

  if (input.doc_type === 'service_agreement') {
    return [
      {
        ...base,
        title: 'Confirm commercial start / kickoff',
        description: `Follow up after signed service agreement for ${company}.`,
        owner_party: 'both',
        due_date: addDaysIso(input.signed_at, 14),
      },
    ]
  }

  // NDA and other legal docs
  return [
    {
      ...base,
      title: 'Protect Confidential Information',
      description: `Ongoing duty under the signed ${input.doc_type === 'nda' ? 'NDA' : 'document'} for ${company}.`,
      owner_party: 'counterparty',
      due_date: null,
    },
    {
      ...base,
      title: 'Return or destroy materials on request',
      description: `Track return/destruction requests for ${company} confidential materials.`,
      owner_party: 'counterparty',
      due_date: null,
    },
  ]
}
