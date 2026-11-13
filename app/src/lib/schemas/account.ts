import { z } from 'zod'
import { ACCOUNT_TYPES, accountTypeInfo } from '../accounts'
import type { AccountInput, ContactInput } from '../accountsStore'
import type { AccountType } from '../types'
import { firstZodError } from './common'

const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES.map((t) => t.value) as [AccountType, ...AccountType[]]

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => !v || /^https?:\/\//i.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(v), {
    message: 'Website looks invalid',
  })

const optionalEmail = z
  .string()
  .trim()
  .refine((v) => !v || z.string().email().safeParse(v).success, {
    message: 'Contact email looks invalid',
  })

export type AccountFormInput = AccountInput & {
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  /** When editing, primary contact fields are ignored. */
  editing?: boolean
}

export type AccountFormParsed = {
  input: AccountInput
  contact: ContactInput | null
}

export const accountFormSchema = z
  .object({
    type: z.enum(ACCOUNT_TYPE_VALUES),
    name: z.string().trim().min(1, 'Enter the company name'),
    industry: z.string().trim(),
    country: z.string().trim(),
    city: z.string().trim(),
    website: optionalUrl,
    status: z.string().trim().min(1, 'Pick a status'),
    owner_user_id: z.string().nullable(),
    source: z.string().trim(),
    notes: z.string().trim(),
    contactName: z.string().trim().optional(),
    contactEmail: optionalEmail.optional(),
    contactPhone: z.string().trim().optional(),
    editing: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const allowed = accountTypeInfo(val.type).statuses
    if (!allowed.includes(val.status)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Status is not valid for this account type',
      })
    }
  })

export function parseAccountForm(
  input: AccountFormInput,
): { ok: true; data: AccountFormParsed } | { ok: false; error: string } {
  const result = accountFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the account form') }
  }
  const v = result.data
  const accountInput: AccountInput = {
    type: v.type,
    name: v.name,
    industry: v.industry,
    country: v.country,
    city: v.city,
    website: v.website,
    status: v.status,
    owner_user_id: v.owner_user_id,
    source: v.source,
    notes: v.notes,
  }
  const contactName = (v.contactName || '').trim()
  const contact: ContactInput | null =
    !v.editing && contactName
      ? {
          name: contactName,
          role: '',
          email: (v.contactEmail || '').trim(),
          phone: (v.contactPhone || '').trim(),
          whatsapp: (v.contactPhone || '').trim(),
          is_primary: true,
        }
      : null
  return { ok: true, data: { input: accountInput, contact } }
}
