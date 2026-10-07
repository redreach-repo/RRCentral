/** Map CRM owner labels (name or email) to @redreach.ae team emails for calendar invites. */

export type TeamMember = { email: string; name: string; active?: boolean }

export function resolveOwnerEmail(ownerLabel: string, team: TeamMember[]): string {
  const label = String(ownerLabel || '').trim()
  if (!label) return ''
  const lower = label.toLowerCase()
  if (lower.includes('@')) return lower
  for (const u of team) {
    if (u.active === false) continue
    const email = String(u.email || '').trim().toLowerCase()
    const name = String(u.name || '').trim().toLowerCase()
    if (!email) continue
    if (email === lower) return email
    if (name && name === lower) return email
    if (email.split('@')[0] === lower) return email
  }
  return ''
}

export function resolveOwnerEmails(ownerField: string, team: TeamMember[]): string[] {
  const out: string[] = []
  for (const part of String(ownerField || '').split(/[,;]/)) {
    const email = resolveOwnerEmail(part.trim(), team)
    if (email && !out.includes(email)) out.push(email)
  }
  return out
}

/** Dedupe attendee emails (case-insensitive). */
export function mergeAttendeeEmails(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const raw of list || []) {
      const email = String(raw || '').trim().toLowerCase()
      if (!email.includes('@') || seen.has(email)) continue
      seen.add(email)
      out.push(email)
    }
  }
  return out
}

export function attendeePayload(emails: string[]): { email: string; status: string }[] {
  return mergeAttendeeEmails(emails).map((email) => ({ email, status: 'NEEDS-ACTION' }))
}
