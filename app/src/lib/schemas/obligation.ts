import { z } from 'zod'
import type { ContractObligationOwner, ContractObligationStatus } from '../types'
import { firstZodError } from './common'

const OWNERS = ['red_reach', 'counterparty', 'both'] as const satisfies readonly ContractObligationOwner[]
const STATUSES = ['open', 'done', 'cancelled'] as const satisfies readonly ContractObligationStatus[]

export type ObligationFormInput = {
  company_name: string
  crm_id: string
  legal_document_id: string | null
  title: string
  description: string
  owner_party: ContractObligationOwner
  due_date: string | null
  status: ContractObligationStatus
}

export const obligationFormSchema = z.object({
  company_name: z.string().trim().min(1, 'Enter the company name'),
  crm_id: z.string().trim(),
  legal_document_id: z.string().trim().nullable(),
  title: z.string().trim().min(1, 'Enter a title'),
  description: z.string().trim(),
  owner_party: z.enum(OWNERS),
  due_date: z
    .string()
    .trim()
    .nullable()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Due date must be YYYY-MM-DD' }),
  status: z.enum(STATUSES),
})

export function parseObligationForm(
  input: ObligationFormInput,
): { ok: true; data: ObligationFormInput } | { ok: false; error: string } {
  const result = obligationFormSchema.safeParse({
    ...input,
    legal_document_id: input.legal_document_id?.trim() ? input.legal_document_id.trim() : null,
    due_date: input.due_date?.trim() ? input.due_date.trim() : null,
  })
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the obligation form') }
  }
  return { ok: true, data: result.data }
}
