/** Record visibility rules stub (app-side evaluate; not RLS). */

export type RecordRuleScope = 'all' | 'owner' | 'team'

export type RecordRule = {
  object_type: string
  scope: RecordRuleScope | string
  filter_json?: Record<string, unknown>
  active?: boolean
}

export type RecordRuleSubject = {
  owner_user_id?: string | null
  owner_email?: string | null
  team_ids?: string[]
}

export type RecordRuleViewer = {
  userId?: string | null
  email?: string | null
  teamIds?: string[]
  role?: string | null
}

/** True when the viewer may see the subject under the active rules for that object. */
export function recordVisible(
  rules: RecordRule[],
  objectType: string,
  subject: RecordRuleSubject,
  viewer: RecordRuleViewer,
): boolean {
  const active = rules.filter((r) => r.active !== false && r.object_type === objectType)
  if (!active.length) return true
  // Admin bypass for stub
  if (String(viewer.role || '').toLowerCase() === 'admin') return true

  return active.some((rule) => {
    const scope = String(rule.scope || 'all')
    if (scope === 'all') return true
    if (scope === 'owner') {
      if (viewer.userId && subject.owner_user_id && viewer.userId === subject.owner_user_id) return true
      if (
        viewer.email &&
        subject.owner_email &&
        viewer.email.trim().toLowerCase() === subject.owner_email.trim().toLowerCase()
      ) {
        return true
      }
      return false
    }
    if (scope === 'team') {
      const vt = new Set((viewer.teamIds || []).map(String))
      return (subject.team_ids || []).some((id) => vt.has(String(id)))
    }
    return true
  })
}
