import { z } from 'zod'
import { firstZodError } from './common'

const optionalEmail = z
  .string()
  .trim()
  .refine((v) => !v || z.string().email().safeParse(v).success, {
    message: 'Email looks invalid',
  })

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => !v || /^https?:\/\//i.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(v), {
    message: 'Website looks invalid',
  })

const optionalTrn = z
  .string()
  .trim()
  .refine((v) => !v || /^\d{9,15}$/.test(v.replace(/\s/g, '')), {
    message: 'TRN should be 9–15 digits',
  })

export type VendorFormInput = {
  company_name: string
  primary_contact: string
  email: string
  mobile: string
  office: string
  address: string
  trn: string
  website: string
  payment_terms: string
  notes: string
}

export const vendorFormSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required'),
  primary_contact: z.string().trim(),
  email: optionalEmail,
  mobile: z.string().trim(),
  office: z.string().trim(),
  address: z.string().trim(),
  trn: optionalTrn,
  website: optionalUrl,
  payment_terms: z.string().trim(),
  notes: z.string().trim(),
})

export function parseVendorForm(
  input: VendorFormInput,
): { ok: true; data: VendorFormInput } | { ok: false; error: string } {
  const result = vendorFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the vendor form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      company_name: d.company_name,
      primary_contact: d.primary_contact,
      email: d.email,
      mobile: d.mobile,
      office: d.office,
      address: d.address,
      trn: d.trn.replace(/\s/g, ''),
      website: d.website,
      payment_terms: d.payment_terms,
      notes: d.notes,
    },
  }
}
