import { z } from 'zod'
import { BILLING_STATUSES } from '../worshiphub'
import type { ChurchDetailsInput } from '../worshiphubStore'
import { firstZodError } from './common'

/** Draft shape from the WorshipHub details modal (modules + conversations as strings). */
export type ChurchDetailsFormInput = {
  tenant_slug: string
  plan: string
  modules: string
  whatsapp_month: string
  whatsapp_conversations: string
  billing_status: string
  renewal_date: string | null
  admin_url: string
  notes: string
}

const billingValues = BILLING_STATUSES.map((s) => s.value) as [string, ...string[]]

export const churchDetailsFormSchema = z
  .object({
    tenant_slug: z.string(),
    plan: z.string(),
    modules: z.string(),
    whatsapp_month: z.string(),
    whatsapp_conversations: z.string(),
    billing_status: z.string(),
    renewal_date: z.string().nullable(),
    admin_url: z.string(),
    notes: z.string(),
  })
  .superRefine((val, ctx) => {
    const slug = val.tenant_slug.trim().toLowerCase()
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The slug uses lowercase letters, numbers and hyphens only, like icoc-uae',
        path: ['tenant_slug'],
      })
    }
    const admin = val.admin_url.trim()
    if (admin && !/^https:\/\//.test(admin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The admin link must start with https://',
        path: ['admin_url'],
      })
    }
    const conv = val.whatsapp_conversations.trim()
    if (conv && !/^\d+$/.test(conv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'WhatsApp conversations must be a whole number',
        path: ['whatsapp_conversations'],
      })
    }
  })

export function parseChurchDetailsForm(
  input: ChurchDetailsFormInput,
): { ok: true; data: ChurchDetailsInput } | { ok: false; error: string } {
  const result = churchDetailsFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the WorshipHub details') }
  }
  const d = result.data
  const billing = billingValues.includes(d.billing_status) ? d.billing_status : ''
  return {
    ok: true,
    data: {
      tenant_slug: d.tenant_slug.trim().toLowerCase(),
      plan: d.plan.trim(),
      modules: [...new Set(d.modules.split(',').map((m) => m.trim()).filter(Boolean))],
      whatsapp_month: d.whatsapp_month.trim(),
      whatsapp_conversations: d.whatsapp_conversations.trim() ? Number(d.whatsapp_conversations.trim()) : null,
      billing_status: billing as ChurchDetailsInput['billing_status'],
      renewal_date: d.renewal_date || null,
      admin_url: d.admin_url.trim(),
      notes: d.notes.trim(),
    },
  }
}
