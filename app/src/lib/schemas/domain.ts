import { z } from 'zod'
import { DOMAIN_BILLING_CYCLES, DOMAIN_STATUSES, normalizeDomainName } from '../domains'
import type { OwnedDomainBillingCycle, OwnedDomainStatus } from '../types'
import { firstZodError } from './common'

const STATUS_VALUES = DOMAIN_STATUSES as [OwnedDomainStatus, ...OwnedDomainStatus[]]
const BILLING_VALUES = DOMAIN_BILLING_CYCLES.map((c) => c.value) as [
  OwnedDomainBillingCycle,
  ...OwnedDomainBillingCycle[],
]

const optionalDate = z
  .string()
  .trim()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date must be YYYY-MM-DD' })

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => !v || /^https?:\/\//i.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(v), {
    message: 'Website URL looks invalid',
  })

export type DomainFormInput = {
  domain_name: string
  registrar: string
  registrar_account: string
  status: OwnedDomainStatus
  registered_on: string
  expires_on: string
  auto_renew: boolean
  dns_provider: string
  nameservers: string
  hosting_provider: string
  website_url: string
  managed_by: string
  cost_aed: string
  billing_cycle: OwnedDomainBillingCycle
  notes: string
}

export type DomainFormParsed = {
  domain_name: string
  registrar: string
  registrar_account: string
  status: OwnedDomainStatus
  registered_on: string
  expires_on: string
  auto_renew: boolean
  dns_provider: string
  nameservers: string
  hosting_provider: string
  website_url: string
  managed_by: string
  cost_aed: number | null
  billing_cycle: OwnedDomainBillingCycle
  notes: string
}

export const domainFormSchema = z
  .object({
    domain_name: z.string(),
    registrar: z.string().trim(),
    registrar_account: z.string().trim(),
    status: z.enum(STATUS_VALUES),
    registered_on: optionalDate,
    expires_on: optionalDate,
    auto_renew: z.boolean(),
    dns_provider: z.string().trim(),
    nameservers: z.string().trim(),
    hosting_provider: z.string().trim(),
    website_url: optionalUrl,
    managed_by: z.string().trim(),
    cost_aed: z.string().trim(),
    billing_cycle: z.enum(BILLING_VALUES),
    notes: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    const name = normalizeDomainName(val.domain_name)
    if (!name || !name.includes('.')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['domain_name'],
        message: 'Enter a valid domain (e.g. redreach.ae)',
      })
    }
    if (val.cost_aed !== '') {
      const n = Number(val.cost_aed)
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cost_aed'],
          message: 'Renewal cost must be a number',
        })
      }
    }
  })

export function parseDomainForm(
  input: DomainFormInput,
): { ok: true; data: DomainFormParsed } | { ok: false; error: string } {
  const result = domainFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the domain form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      domain_name: normalizeDomainName(d.domain_name),
      registrar: d.registrar,
      registrar_account: d.registrar_account,
      status: d.status,
      registered_on: d.registered_on,
      expires_on: d.expires_on,
      auto_renew: d.auto_renew,
      dns_provider: d.dns_provider,
      nameservers: d.nameservers,
      hosting_provider: d.hosting_provider,
      website_url: d.website_url,
      managed_by: d.managed_by,
      cost_aed: d.cost_aed === '' ? null : Number(d.cost_aed),
      billing_cycle: d.billing_cycle,
      notes: d.notes,
    },
  }
}
