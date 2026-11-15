/** Construction pack site helpers. */

export const SITE_STATUSES = ['planned', 'active', 'on_hold', 'closed'] as const

export function siteLabel(code: string, name: string): string {
  const c = code.trim()
  return c ? `${c} · ${name}` : name
}

export function assignmentWindow(startsOn: string | null, endsOn: string | null): string {
  if (!startsOn && !endsOn) return 'open-ended'
  if (startsOn && endsOn) return `${startsOn} → ${endsOn}`
  if (startsOn) return `from ${startsOn}`
  return `until ${endsOn}`
}
