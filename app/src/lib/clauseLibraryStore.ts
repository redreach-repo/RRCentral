import { db } from './db'
import { isMissingRelationError } from './errors'
import type { ClauseFormInput } from './schemas/clause'
import type { ContractClause } from './types'

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

export async function listContractClauses(): Promise<{ rows: ContractClause[]; missingTable: boolean }> {
  const { data, error } = await db
    .from('contract_clauses')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as ContractClause[], missingTable: false }
}

export async function saveContractClause(
  input: ClauseFormInput,
  author: string,
  id?: string,
): Promise<string> {
  const now = new Date().toISOString()
  if (id) {
    check(
      await db
        .from('contract_clauses')
        .update({
          clause_key: input.clause_key,
          title: input.title,
          body: input.body,
          category: input.category,
          status: input.status,
          sort_order: input.sort_order,
          notes: input.notes,
          updated_at: now,
        })
        .eq('id', id),
    )
    return id
  }
  const newId = crypto.randomUUID()
  check(
    await db.from('contract_clauses').insert({
      id: newId,
      clause_key: input.clause_key,
      title: input.title,
      body: input.body,
      category: input.category,
      status: input.status,
      sort_order: input.sort_order,
      notes: input.notes,
      created_by: author,
      created_at: now,
      updated_at: now,
    }),
  )
  return newId
}

export async function deleteContractClause(id: string): Promise<void> {
  check(await db.from('contract_clauses').delete().eq('id', id).eq('status', 'draft'))
}
