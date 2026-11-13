import { z } from 'zod'
import type { ContractClauseCategory, ContractClauseStatus } from '../types'
import { firstZodError } from './common'

const CATEGORIES = [
  'confidentiality',
  'obligations',
  'term',
  'liability',
  'general',
  'other',
] as const satisfies readonly ContractClauseCategory[]

const STATUSES = ['draft', 'active', 'retired'] as const satisfies readonly ContractClauseStatus[]

export type ClauseFormInput = {
  clause_key: string
  title: string
  body: string
  category: ContractClauseCategory
  status: ContractClauseStatus
  sort_order: number
  notes: string
}

export const clauseFormSchema = z.object({
  clause_key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,62}$/, 'Key must start with a letter and use a–z, 0–9, _'),
  title: z.string().trim().min(1, 'Enter a title'),
  body: z.string().trim().min(1, 'Enter the clause wording'),
  category: z.enum(CATEGORIES),
  status: z.enum(STATUSES),
  sort_order: z.number().int().min(0).max(9999),
  notes: z.string().trim(),
})

export function parseClauseForm(
  input: ClauseFormInput,
): { ok: true; data: ClauseFormInput } | { ok: false; error: string } {
  const result = clauseFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the clause form') }
  }
  return { ok: true, data: result.data }
}
