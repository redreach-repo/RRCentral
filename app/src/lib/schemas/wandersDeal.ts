import { z } from 'zod'
import { firstZodError } from './common'

export type WandersDealFormInput = {
  client_name: string
}

export type WandersDealFormParsed = {
  client_name: string
}

export const wandersDealFormSchema = z.object({
  client_name: z.string().trim().min(1, 'Client / booker name is required'),
})

export function parseWandersDealForm(
  input: WandersDealFormInput,
): { ok: true; data: WandersDealFormParsed } | { ok: false; error: string } {
  const result = wandersDealFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the Wanders deal') }
  }
  return { ok: true, data: { client_name: result.data.client_name } }
}

export type WandersTermsAcceptFormInput = {
  terms_version: string
  accepted_by: string
}

export type WandersTermsAcceptFormParsed = {
  terms_version: string
  accepted_by: string
}

export const wandersTermsAcceptFormSchema = z.object({
  terms_version: z.string().trim().min(1, 'Terms version required before acceptance'),
  accepted_by: z.string().trim().min(1, 'Accepted by (customer name) is required'),
})

export function parseWandersTermsAcceptForm(
  input: WandersTermsAcceptFormInput,
): { ok: true; data: WandersTermsAcceptFormParsed } | { ok: false; error: string } {
  const result = wandersTermsAcceptFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check terms acceptance') }
  }
  return {
    ok: true,
    data: {
      terms_version: result.data.terms_version,
      accepted_by: result.data.accepted_by,
    },
  }
}
