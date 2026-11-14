import { z } from 'zod'
import type { ContactInput } from '../accountsStore'
import { ACTIVITY_KINDS } from '../accounts'
import type { AccountActivityKind } from '../types'
import { firstZodError } from './common'

const optionalEmail = z
  .string()
  .trim()
  .refine((v) => !v || z.string().email().safeParse(v).success, {
    message: 'Contact email looks invalid',
  })

const KIND_VALUES = ACTIVITY_KINDS.filter((k) => k.value !== 'system').map((k) => k.value) as [
  AccountActivityKind,
  ...AccountActivityKind[],
]

export type AccountContactFormInput = ContactInput

export const accountContactFormSchema = z.object({
  name: z.string().trim().min(1, 'Add a name for the contact'),
  role: z.string().trim(),
  email: optionalEmail,
  phone: z.string().trim(),
  whatsapp: z.string().trim(),
  is_primary: z.boolean(),
})

export function parseAccountContactForm(
  input: AccountContactFormInput,
): { ok: true; data: ContactInput } | { ok: false; error: string } {
  const result = accountContactFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the contact form') }
  }
  return { ok: true, data: result.data }
}

export type AccountNoteFormInput = {
  kind: AccountActivityKind
  body: string
}

export type AccountNoteFormParsed = {
  kind: AccountActivityKind
  body: string
}

export const accountNoteFormSchema = z.object({
  kind: z.enum(KIND_VALUES),
  body: z.string().trim().min(1, 'Write a note first'),
})

export function parseAccountNoteForm(
  input: AccountNoteFormInput,
): { ok: true; data: AccountNoteFormParsed } | { ok: false; error: string } {
  const result = accountNoteFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the timeline note') }
  }
  return { ok: true, data: { kind: result.data.kind, body: result.data.body } }
}
