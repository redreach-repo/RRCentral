import { z } from 'zod'
import { DIVISIONS, PAYMENT_TERMS } from '../config'
import { firstZodError } from './common'

const divisionCodes = DIVISIONS.map((d) => d.code) as unknown as [string, ...string[]]
const paymentTerms = [...PAYMENT_TERMS] as unknown as [string, ...string[]]

export type ContractInvoiceSettingsInput = {
  division: string
  terms: string
}

export type ContractInvoiceSettingsParsed = {
  division: (typeof DIVISIONS)[number]['code']
  terms: (typeof PAYMENT_TERMS)[number]
}

export const contractInvoiceSettingsSchema = z.object({
  division: z.enum(divisionCodes, { message: 'Pick a division' }),
  terms: z.enum(paymentTerms, { message: 'Pick payment terms' }),
})

export function parseContractInvoiceSettings(
  input: ContractInvoiceSettingsInput,
): { ok: true; data: ContractInvoiceSettingsParsed } | { ok: false; error: string } {
  const result = contractInvoiceSettingsSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the contract invoice settings') }
  }
  return {
    ok: true,
    data: {
      division: result.data.division as ContractInvoiceSettingsParsed['division'],
      terms: result.data.terms as ContractInvoiceSettingsParsed['terms'],
    },
  }
}
