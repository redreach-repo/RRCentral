/** M10: marketing consent + segment helpers. */

export type MarketingSegmentFilter = {
  opt_in_only?: boolean
  channel?: string
}

export function normalizeConsentSource(source: string): string {
  return String(source || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .slice(0, 64)
}

export function canQueueRecipient(input: {
  marketing_opt_in: boolean
  email?: string | null
  requireOptIn?: boolean
}): { ok: boolean; reason: string } {
  if (input.requireOptIn !== false && !input.marketing_opt_in) {
    return { ok: false, reason: 'no_consent' }
  }
  if (!String(input.email || '').trim()) {
    return { ok: false, reason: 'no_email' }
  }
  return { ok: true, reason: '' }
}

export function segmentMatchesContact(
  filter: MarketingSegmentFilter,
  contact: { marketing_opt_in: boolean; email?: string | null },
): boolean {
  if (filter.opt_in_only && !contact.marketing_opt_in) return false
  if (filter.channel === 'email' && !String(contact.email || '').trim()) return false
  return true
}

export function recipientStatusForQueue(ok: boolean, _reason: string): 'queued' | 'skipped' {
  return ok ? 'queued' : 'skipped'
}
