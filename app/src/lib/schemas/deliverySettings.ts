import { z } from 'zod'
import { firstZodError } from './common'

const nonNegNumber = (label: string) =>
  z
    .string()
    .trim()
    .superRefine((raw, ctx) => {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` })
      }
    })
    .transform((raw) => Number(raw))

const optionalNonNeg = (label: string) =>
  z
    .string()
    .trim()
    .superRefine((raw, ctx) => {
      if (raw === '') return
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` })
      }
    })
    .transform((raw) => (raw === '' ? null : Number(raw)))

export type DeliveryPackageFormInput = {
  name: string
  support_response: string
  monthly_fee_a: string
  setup_fee_b: string
  monthly_fee_b: string
  target_hours: string
  build_hours_target: string
  included_whatsapp: string
  support_response_days: string
  ai_cap_usd: string
  included_lead_credits_usd: string
  tool_cost_aed: string
  fallbackName: string
}

export type DeliveryPackageFormParsed = {
  name: string
  support_response: string
  monthly_fee_a: number
  setup_fee_b: number
  monthly_fee_b: number
  target_hours: number
  build_hours_target: number
  included_whatsapp: number
  support_response_days: number
  ai_cap_usd: number | null
  included_lead_credits_usd: number | null
  tool_cost_aed: number
}

export const deliveryPackageFormSchema = z.object({
  name: z.string(),
  support_response: z.string(),
  monthly_fee_a: nonNegNumber('Monthly AED (option A)'),
  setup_fee_b: nonNegNumber('Setup fee AED (option B)'),
  monthly_fee_b: nonNegNumber('Monthly AED (option B)'),
  target_hours: nonNegNumber('Target hours a month'),
  build_hours_target: nonNegNumber('Build hours target'),
  included_whatsapp: nonNegNumber('Included WhatsApp conversations'),
  support_response_days: nonNegNumber('Support response, working days (0 = same day)'),
  ai_cap_usd: optionalNonNeg('AI cap a month, USD (blank = not set)'),
  included_lead_credits_usd: optionalNonNeg('Included lead credits a month, USD'),
  tool_cost_aed: nonNegNumber('Fixed tool cost a month, AED (estimate)'),
  fallbackName: z.string(),
})

export function parseDeliveryPackageForm(
  input: DeliveryPackageFormInput,
): { ok: true; data: DeliveryPackageFormParsed } | { ok: false; error: string } {
  const result = deliveryPackageFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the package form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      name: d.name.trim() || d.fallbackName,
      support_response: d.support_response.trim(),
      monthly_fee_a: d.monthly_fee_a,
      setup_fee_b: d.setup_fee_b,
      monthly_fee_b: d.monthly_fee_b,
      target_hours: d.target_hours,
      build_hours_target: d.build_hours_target,
      included_whatsapp: d.included_whatsapp,
      support_response_days: d.support_response_days,
      ai_cap_usd: d.ai_cap_usd,
      included_lead_credits_usd: d.included_lead_credits_usd,
      tool_cost_aed: d.tool_cost_aed,
    },
  }
}

export type DeliveryRatesFormInput = {
  marketingRateAed: string
  serviceRateAed: string
  aiMarkupPercent: string
  leadMarkupPercent: string
  internalHourlyRateAed: string
  usdToAed: string
  fixedMonthlyCostAed: string
}

const RATE_LABELS: Record<keyof DeliveryRatesFormInput, string> = {
  marketingRateAed: 'Marketing message above plan, AED',
  serviceRateAed: 'Service or utility message above plan, AED',
  aiMarkupPercent: 'AI usage above cap, markup %',
  leadMarkupPercent: 'Extra lead credits, markup %',
  internalHourlyRateAed: 'Internal hourly rate, AED',
  usdToAed: 'USD to AED rate',
  fixedMonthlyCostAed: 'Fixed costs a month, AED (estimate, for the dashboard)',
}

export const deliveryRatesFormSchema = z.object({
  marketingRateAed: nonNegNumber(RATE_LABELS.marketingRateAed),
  serviceRateAed: nonNegNumber(RATE_LABELS.serviceRateAed),
  aiMarkupPercent: nonNegNumber(RATE_LABELS.aiMarkupPercent),
  leadMarkupPercent: nonNegNumber(RATE_LABELS.leadMarkupPercent),
  internalHourlyRateAed: nonNegNumber(RATE_LABELS.internalHourlyRateAed),
  usdToAed: nonNegNumber(RATE_LABELS.usdToAed),
  fixedMonthlyCostAed: nonNegNumber(RATE_LABELS.fixedMonthlyCostAed),
})

export function parseDeliveryRatesForm(
  input: DeliveryRatesFormInput,
): { ok: true; data: Record<keyof DeliveryRatesFormInput, number> } | { ok: false; error: string } {
  const result = deliveryRatesFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the rates form') }
  }
  return { ok: true, data: result.data }
}
