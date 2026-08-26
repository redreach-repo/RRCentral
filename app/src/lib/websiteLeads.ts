import { db, isSupabaseConfigured } from './db'
import type { CrmEntry, WebsiteInquiry } from './types'
import { VERTICALS } from '../site/data/verticals'

export type WebsiteInquiryInput = {
  name: string
  email: string
  phone: string
  vertical: string
  message: string
}

export type InquiryValidation = {
  ok: boolean
  errors: Partial<Record<keyof WebsiteInquiryInput, string>>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateWebsiteInquiry(input: WebsiteInquiryInput): InquiryValidation {
  const errors: InquiryValidation['errors'] = {}
  if (!input.name.trim()) errors.name = 'Name is required'
  if (!input.email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_RE.test(input.email.trim())) errors.email = 'Enter a valid email'
  if (!input.message.trim()) errors.message = 'Tell us how we can help'
  if (input.vertical && input.vertical !== 'general' && !VERTICALS.some((v) => v.slug === input.vertical || v.brand === input.vertical)) {
    errors.vertical = 'Choose a desk'
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

export function verticalBrandForInquiry(vertical: string): string {
  const match = VERTICALS.find((v) => v.slug === vertical || v.brand === vertical)
  if (vertical === 'general') return 'General enquiry'
  return match?.brand || vertical || 'Red Reach'
}

export function buildWebsiteInquiry(
  input: WebsiteInquiryInput,
  now = new Date(),
  id: string = crypto.randomUUID(),
): WebsiteInquiry {
  return {
    id,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    vertical: input.vertical.trim(),
    message: input.message.trim(),
    status: 'new',
    crm_id: '',
    created_at: now.toISOString(),
  }
}

export function buildCrmLeadFromInquiry(
  inquiry: WebsiteInquiry,
  now = new Date(),
  id: string = crypto.randomUUID(),
): CrmEntry {
  const brand = verticalBrandForInquiry(inquiry.vertical)
  const stamp = now.toISOString()
  return {
    id,
    company_name: inquiry.name,
    primary_contact: inquiry.name,
    email_phone: inquiry.email,
    mobile_number: inquiry.phone,
    office_number: '',
    notes: [`Website inquiry${brand ? ` · ${brand}` : ''}`, inquiry.message].filter(Boolean).join('\n\n'),
    follow_up_date: stamp.slice(0, 10),
    next_action: 'Call',
    owner: '',
    company_owner: '',
    address: '',
    website: 'www.redreach.ae',
    trn: '',
    pipeline_stage: 'Lead',
    quote_ref: '',
    outcome_reason: '',
    calendar_event_id: '',
    contacts: [
      {
        id: crypto.randomUUID(),
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        role: 'Primary',
      },
    ],
    created_by: 'website',
    updated_by: 'website',
    created_at: stamp,
    updated_at: stamp,
  }
}

export type SubmitInquiryResult = {
  inquiry: WebsiteInquiry
  crmId: string | null
  stored: boolean
}

/**
 * Persist a public website inquiry.
 * Local mode writes to IndexedDB (inquiry + CRM lead).
 * Supabase mode writes inquiries if the table/policy exists; CRM insert needs a signed-in user.
 */
export async function submitWebsiteInquiry(input: WebsiteInquiryInput): Promise<SubmitInquiryResult> {
  const inquiry = buildWebsiteInquiry(input)
  const { error } = await db.from('website_inquiries').insert(inquiry)
  let stored = !error

  let crmId: string | null = null
  if (!isSupabaseConfigured()) {
    const lead = buildCrmLeadFromInquiry(inquiry)
    const { error: crmErr } = await db.from('crm').insert(lead)
    if (!crmErr) {
      crmId = lead.id
      inquiry.crm_id = lead.id
      inquiry.status = 'converted'
      await db.from('website_inquiries').update({ crm_id: lead.id, status: 'converted' }).eq('id', inquiry.id)
      stored = true
    }
  }

  if (error && isSupabaseConfigured()) {
    stored = false
  }

  return { inquiry, crmId, stored }
}

export function mailtoForInquiry(input: WebsiteInquiryInput): string {
  const brand = verticalBrandForInquiry(input.vertical)
  const subject = encodeURIComponent(`Red Reach enquiry${brand ? ` — ${brand}` : ''}`)
  const body = encodeURIComponent(
    [`Name: ${input.name}`, `Email: ${input.email}`, `Phone: ${input.phone}`, `Vertical: ${brand}`, '', input.message].join(
      '\n',
    ),
  )
  return `mailto:info@redreach.ae?subject=${subject}&body=${body}`
}
