import { z } from 'zod'
import { firstZodError } from './common'

export type VaultNdaFormInput = {
  partyName: string
  partyEmail: string
}

export type VaultNdaFormParsed = {
  partyName: string
  partyEmail: string
}

const optionalEmail = z
  .string()
  .trim()
  .refine((v) => !v || z.string().email().safeParse(v).success, {
    message: 'Signer email looks invalid',
  })

export const vaultNdaFormSchema = z.object({
  partyName: z.string().trim().min(1, 'Choose who will sign (contact name).'),
  partyEmail: optionalEmail,
})

export function parseVaultNdaForm(
  input: VaultNdaFormInput,
): { ok: true; data: VaultNdaFormParsed } | { ok: false; error: string } {
  const result = vaultNdaFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the NDA signer') }
  }
  return {
    ok: true,
    data: {
      partyName: result.data.partyName,
      partyEmail: result.data.partyEmail,
    },
  }
}
