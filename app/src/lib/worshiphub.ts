import type { WorshipBillingStatus, WorshipChurchProfile, WorshipTenant } from './types'

/**
 * WorshipHub read only integration. RR Central only ever holds the account
 * level fields in WorshipTenant: never members, visitors or registrations.
 * The `worshiphub-read` Edge Function runs sanitiseTenants() (bundled from
 * this file) on WorshipHub's answer, so anything else is dropped there.
 * Field spec: docs/worshiphub-integration.md
 */

export const BILLING_STATUSES: { value: Exclude<WorshipBillingStatus, ''>; label: string }[] = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Paid up' },
  { value: 'past_due', label: 'Payment overdue' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const RENEWAL_WARNING_DAYS = 60

export function billingLabel(status: string): string {
  return BILLING_STATUSES.find((s) => s.value === status)?.label ?? 'Not set'
}

export function hasBillingIssue(status: string): boolean {
  return status === 'past_due' || status === 'cancelled'
}

const SLUG_RE = /^[a-z0-9-]{1,80}$/
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

function text(v: unknown, max = 120): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function count(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 10_000_000) : 0
}

function httpsUrl(v: unknown): string {
  const s = text(v, 500)
  try {
    return new URL(s).protocol === 'https:' ? s : ''
  } catch {
    return ''
  }
}

/** Keep only the agreed account level fields from one WorshipHub row. */
export function sanitiseTenant(raw: unknown): WorshipTenant | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const slug = text(r.slug, 80).toLowerCase()
  if (!SLUG_RE.test(slug)) return null
  const billing = text(r.billing_status, 20) as WorshipBillingStatus
  const month = text(r.whatsapp_month, 7)
  const renewal = text(r.renewal_date, 10)
  const review = text(r.review_status, 20)
  const verification = text(r.verification_status, 20)
  const registered = text(r.registered_at, 40)
  const email = text(r.contact_email, 200).toLowerCase()
  return {
    slug,
    name: text(r.name, 200),
    plan: text(r.plan, 60),
    modules: Array.isArray(r.modules)
      ? [...new Set(r.modules.map((m) => text(m, 60)).filter(Boolean))].slice(0, 40)
      : [],
    whatsapp_month: MONTH_RE.test(month) ? month : '',
    whatsapp_marketing: count(r.whatsapp_marketing),
    whatsapp_service: count(r.whatsapp_service),
    whatsapp_utility: count(r.whatsapp_utility),
    billing_status: BILLING_STATUSES.some((s) => s.value === billing) ? billing : '',
    renewal_date: DATE_RE.test(renewal) && !Number.isNaN(Date.parse(renewal)) ? renewal : null,
    admin_url: httpsUrl(r.admin_url),
    review_status: review === 'pending' || review === 'approved' || review === 'rejected' ? review : '',
    verification_status: (['unverified', 'pending', 'verified', 'rejected'] as const).find((v) => v === verification) ?? '',
    registered_at: registered && !Number.isNaN(Date.parse(registered)) ? new Date(registered).toISOString() : null,
    contact_name: text(r.contact_name, 120),
    contact_email: EMAIL_RE.test(email) ? email : '',
    user_count: r.user_count == null ? null : count(r.user_count),
  }
}

/** Churches that signed up on WorshipHub and are waiting for review, newest first. */
export function joinRequests(tenants: WorshipTenant[]): WorshipTenant[] {
  return tenants
    .filter((t) => t.review_status === 'pending')
    .sort((a, b) => String(b.registered_at ?? '').localeCompare(String(a.registered_at ?? '')))
}

export type ChurchAction = 'accept' | 'reject' | 'verify' | 'delete'

export const CHURCH_ACTIONS: Record<ChurchAction, { label: string; done: string; confirm: ((name: string) => string) | null }> = {
  accept: { label: 'Accept', done: 'accepted', confirm: null },
  verify: { label: 'Verify', done: 'verified', confirm: null },
  reject: {
    label: 'Reject',
    done: 'rejected',
    confirm: (name) => `Reject ${name} on WorshipHub? It is hidden from church search. You can accept it later.`,
  },
  delete: {
    label: 'Delete',
    done: 'deleted',
    confirm: (name) =>
      `Delete ${name} from WorshipHub for good? This cannot be undone. WorshipHub only deletes empty test or duplicate churches and refuses one with songs, setlists or other members.`,
  },
}

/** Review actions that make sense for this church right now, in button order. */
export function churchActions(t: Pick<WorshipTenant, 'review_status' | 'verification_status'>): ChurchAction[] {
  const out: ChurchAction[] = []
  if (t.review_status === 'pending' || t.review_status === 'rejected') out.push('accept')
  if (t.verification_status !== 'verified') out.push('verify')
  if (t.review_status !== 'rejected') out.push('reject')
  out.push('delete')
  return out
}

/** Accepts `{ tenants: [...] }` or a bare array (a database view over REST). */
export function sanitiseTenants(body: unknown): WorshipTenant[] {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { tenants?: unknown }).tenants)
      ? (body as { tenants: unknown[] }).tenants
      : []
  const seen = new Set<string>()
  const out: WorshipTenant[] = []
  for (const row of list.slice(0, 1000)) {
    const t = sanitiseTenant(row)
    if (t && !seen.has(t.slug)) {
      seen.add(t.slug)
      out.push(t)
    }
  }
  return out
}

/** What the church card and the Products page show for one church. */
export type ChurchView = {
  source: 'live' | 'manual'
  plan: string
  modules: string[]
  whatsappMonth: string
  whatsappTotal: number | null
  whatsappSplit: { marketing: number; service: number; utility: number } | null
  billingStatus: WorshipBillingStatus
  renewalDate: string | null
  adminUrl: string
}

/** Live values when WorshipHub answered for this slug, otherwise what was entered by hand. */
export function churchView(profile: WorshipChurchProfile | null, live: WorshipTenant | null): ChurchView {
  if (live) {
    // WorshipHub does not send WhatsApp counts yet: keep the ones typed in by hand.
    const liveWhatsapp = live.whatsapp_month !== ''
    return {
      source: 'live',
      plan: live.plan,
      modules: live.modules,
      whatsappMonth: liveWhatsapp ? live.whatsapp_month : (profile?.whatsapp_month ?? ''),
      whatsappTotal: liveWhatsapp
        ? live.whatsapp_marketing + live.whatsapp_service + live.whatsapp_utility
        : (profile?.whatsapp_conversations ?? null),
      whatsappSplit: liveWhatsapp
        ? {
            marketing: live.whatsapp_marketing,
            service: live.whatsapp_service,
            utility: live.whatsapp_utility,
          }
        : null,
      billingStatus: live.billing_status,
      renewalDate: live.renewal_date,
      adminUrl: live.admin_url || profile?.admin_url || '',
    }
  }
  return {
    source: 'manual',
    plan: profile?.plan ?? '',
    modules: profile?.modules ?? [],
    whatsappMonth: profile?.whatsapp_month ?? '',
    whatsappTotal: profile?.whatsapp_conversations ?? null,
    whatsappSplit: null,
    billingStatus: profile?.billing_status ?? '',
    renewalDate: profile?.renewal_date ?? null,
    adminUrl: profile?.admin_url ?? '',
  }
}

/** Renewal falls within the warning window (or has passed). */
export function renewalSoon(renewalDate: string | null, now: Date = new Date()): boolean {
  if (!renewalDate) return false
  const due = new Date(`${renewalDate}T00:00:00`)
  const days = (due.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000
  return days <= RENEWAL_WARNING_DAYS
}

export function monthLabel(month: string): string {
  if (!MONTH_RE.test(month)) return ''
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/** Problem with church details as typed, or null. */
export function churchDetailsProblem(d: { tenant_slug: string; admin_url: string; whatsapp_conversations: string }): string | null {
  if (d.tenant_slug && !/^[a-z0-9-]+$/.test(d.tenant_slug)) {
    return 'The slug uses lowercase letters, numbers and hyphens only, like icoc-uae'
  }
  if (d.admin_url && !/^https:\/\//.test(d.admin_url)) return 'The admin link must start with https://'
  if (d.whatsapp_conversations.trim() && !/^\d+$/.test(d.whatsapp_conversations.trim())) {
    return 'WhatsApp conversations must be a whole number'
  }
  return null
}
