import { db } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import type { IntakeRow } from './leadIntake'
import { getSupabaseRuntimeConfig, isSupabaseConfigured } from './supabaseConfig'

const COLUMNS = 'id, name, email, phone, source, channel, status, pipeline, account_id, crm_id, deal_id, matched, created_at'

/** Leads from the intake since a time, newest first. Empty until the "Lead intake" SQL has run. */
export async function listRecentLeads(since: Date): Promise<IntakeRow[]> {
  const { data, error } = await db
    .from('website_inquiries')
    .select(COLUMNS)
    .gte('created_at', since.toISOString())
    .in('status', ['new', 'converted'])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return []
    throw error
  }
  return (data || []) as IntakeRow[]
}

function functionUrl(query = ''): string | null {
  const cfg = getSupabaseRuntimeConfig()
  if (!isSupabaseConfigured() || !cfg.url) return null
  return `${cfg.url.replace(/\/$/, '')}/functions/v1/lead-intake${query}`
}

/** A form token from lead-intake, or '' when the function is not there yet. */
export async function fetchLeadFormToken(): Promise<string> {
  const url = functionUrl('?form_token=1')
  if (!url) return ''
  try {
    const res = await fetch(url, { headers: { apikey: getSupabaseRuntimeConfig().anonKey }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return ''
    const body = (await res.json()) as { form_token?: string }
    return body.form_token || ''
  } catch {
    return ''
  }
}

/** UTM values and the page, from the address the visitor landed on. */
export function pageUtm(href: string): Record<string, string> {
  try {
    const u = new URL(href)
    const out: Record<string, string> = { page_url: `${u.origin}${u.pathname}` }
    for (const k of ['source', 'medium', 'campaign', 'term', 'content']) {
      const v = u.searchParams.get(`utm_${k}`)
      if (v) out[`utm_${k}`] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Sends a lead through lead-intake. True when it was taken. */
export async function sendLead(lead: Record<string, unknown>, formToken: string): Promise<boolean> {
  const url = functionUrl()
  if (!url || !formToken) return false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: getSupabaseRuntimeConfig().anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, form_token: formToken }),
      signal: AbortSignal.timeout(20_000),
    })
    await res.body?.cancel()
    return res.ok
  } catch {
    return false
  }
}
