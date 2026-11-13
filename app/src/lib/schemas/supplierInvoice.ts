import { z } from 'zod'
import { isDriveShareUrl } from '../customerFiles'
import { firstZodError } from './common'

export type SupplierInvoiceFormInput = {
  date: string
  vendor: string
  supplier_invoice_no: string
  amount: number
  amount_ex_vat: number
  vat_amount: number
  charges_vat: boolean
  payment_method: string
  notes: string
  /** Drive share URL; blank is allowed (expense-only save). */
  drive_url: string
  drive_title: string
  /** Existing attachment URL that may be a legacy non-Drive link. */
  existing_drive_url?: string
}

export type SupplierInvoiceFormParsed = {
  date: string
  vendor: string
  supplier_invoice_no: string
  amount: number
  amount_ex_vat: number
  vat_amount: number
  charges_vat: boolean
  payment_method: string
  notes: string
  drive_url: string
  drive_title: string
}

const optionalYmd = z
  .string()
  .trim()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date must be YYYY-MM-DD' })

export const supplierInvoiceFormSchema = z
  .object({
    date: optionalYmd,
    vendor: z.string().trim().min(1, 'Vendor is required'),
    supplier_invoice_no: z.string().trim(),
    amount: z.number().finite().min(0, 'Amount cannot be negative'),
    amount_ex_vat: z.number().finite().min(0, 'Amount cannot be negative'),
    vat_amount: z.number().finite().min(0, 'VAT cannot be negative'),
    charges_vat: z.boolean(),
    payment_method: z.string().trim().min(1, 'Pick a payment method'),
    notes: z.string(),
    drive_url: z.string(),
    drive_title: z.string(),
    existing_drive_url: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!(val.amount > 0) && !(val.amount_ex_vat > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'Enter the supplier invoice total',
      })
    }
    const linkUrl = val.drive_url.trim()
    if (
      linkUrl &&
      !isDriveShareUrl(linkUrl) &&
      linkUrl !== (val.existing_drive_url || '').trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['drive_url'],
        message: 'Use a Google Drive share link',
      })
    }
  })

export function parseSupplierInvoiceForm(
  input: SupplierInvoiceFormInput,
): { ok: true; data: SupplierInvoiceFormParsed } | { ok: false; error: string } {
  const result = supplierInvoiceFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the supplier invoice form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      date: d.date,
      vendor: d.vendor,
      supplier_invoice_no: d.supplier_invoice_no,
      amount: d.amount,
      amount_ex_vat: d.amount_ex_vat,
      vat_amount: d.vat_amount,
      charges_vat: d.charges_vat,
      payment_method: d.payment_method,
      notes: d.notes.trim(),
      drive_url: d.drive_url.trim(),
      drive_title: d.drive_title.trim(),
    },
  }
}
