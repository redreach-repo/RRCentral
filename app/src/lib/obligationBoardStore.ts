import { db } from './db'
import { isMissingRelationError } from './errors'
import type { ObligationFormInput } from './schemas/obligation'
import type { ContractObligation } from './types'

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

export async function listContractObligations(): Promise<{
  rows: ContractObligation[]
  missingTable: boolean
}> {
  const { data, error } = await db
    .from('contract_obligations')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as ContractObligation[], missingTable: false }
}

export async function saveContractObligation(
  input: ObligationFormInput,
  author: string,
  id?: string,
): Promise<string> {
  const now = new Date().toISOString()
  const completed_at = input.status === 'done' ? now : null
  if (id) {
    check(
      await db
        .from('contract_obligations')
        .update({
          company_name: input.company_name,
          crm_id: input.crm_id,
          legal_document_id: input.legal_document_id,
          title: input.title,
          description: input.description,
          owner_party: input.owner_party,
          due_date: input.due_date,
          status: input.status,
          completed_at,
          updated_at: now,
        })
        .eq('id', id),
    )
    return id
  }
  const newId = crypto.randomUUID()
  check(
    await db.from('contract_obligations').insert({
      id: newId,
      company_name: input.company_name,
      crm_id: input.crm_id,
      legal_document_id: input.legal_document_id,
      title: input.title,
      description: input.description,
      owner_party: input.owner_party,
      due_date: input.due_date,
      status: input.status,
      completed_at,
      created_by: author,
      created_at: now,
      updated_at: now,
    }),
  )
  return newId
}

export async function setObligationStatus(
  id: string,
  status: 'open' | 'done' | 'cancelled',
): Promise<void> {
  const now = new Date().toISOString()
  check(
    await db
      .from('contract_obligations')
      .update({
        status,
        completed_at: status === 'done' ? now : null,
        updated_at: now,
      })
      .eq('id', id),
  )
}
