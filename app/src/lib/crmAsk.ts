/**
 * Read-only "Ask RR" for the Threads CRM: pack a compact snapshot of deals
 * the person can already see, then Claude answers from those facts only.
 */

import { followUpBucket, sortByFollowUpUrgency } from './crmWorkQueue'
import type { CrmEntry } from './types'

const MAX_DEAL_FACTS = 60
const NOTE_CHARS = 120

export const CRM_ASK_SUGGESTIONS = [
  "What's overdue for me today?",
  'Who needs a follow-up this week?',
  'Summarise the open pipeline by stage',
  'Which deals have no next action?',
] as const

function shortNote(notes: string | null | undefined): string {
  const t = String(notes || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > NOTE_CHARS ? `${t.slice(0, NOTE_CHARS - 1)}…` : t
}

function dealLine(e: CrmEntry, today: Date): string {
  const bucket = followUpBucket(e.follow_up_date, today)
  const follow =
    bucket === 'None'
      ? 'no follow-up date'
      : `follow-up ${String(e.follow_up_date || '').slice(0, 10)} (${bucket.toLowerCase()})`
  const parts = [
    e.company_name || 'Unnamed',
    `stage ${e.pipeline_stage || 'Lead'}`,
    e.owner ? `owner ${e.owner}` : 'unassigned',
    follow,
    e.next_action ? `next: ${e.next_action}` : 'no next action',
  ]
  if (e.quote_ref) parts.push(`quote ${e.quote_ref}`)
  const note = shortNote(e.notes)
  if (note) parts.push(`notes: ${note}`)
  return parts.join(' · ')
}

/**
 * Compact CRM facts for the model. Prefer overdue / today / my deals, then
 * other open stages. Won/Lost are only included when few open deals remain.
 */
export function buildCrmAskFacts(
  entries: CrmEntry[],
  opts: { myOwnerName?: string; today?: Date } = {},
): string[] {
  const today = opts.today || new Date()
  const my = (opts.myOwnerName || '').trim()
  const open = entries.filter((e) => {
    const s = e.pipeline_stage || 'Lead'
    return s !== 'Won' && s !== 'Lost'
  })

  const overdue = open.filter((e) => followUpBucket(e.follow_up_date, today) === 'Overdue')
  const dueToday = open.filter((e) => followUpBucket(e.follow_up_date, today) === 'Today')
  const mine = my ? open.filter((e) => (e.owner || '').trim() === my) : []
  const byStage: Record<string, number> = {}
  for (const e of open) {
    const s = e.pipeline_stage || 'Lead'
    byStage[s] = (byStage[s] || 0) + 1
  }

  const facts: string[] = [
    `Open deals: ${open.length} (of ${entries.length} CRM companies)`,
    `Follow-ups: ${overdue.length} overdue, ${dueToday.length} today`,
  ]
  if (my) facts.push(`Assigned to ${my}: ${mine.length} open`)
  const stageBits = Object.entries(byStage)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s} ${n}`)
  if (stageBits.length) facts.push(`By stage: ${stageBits.join(', ')}`)

  const ranked = [...open].sort(sortByFollowUpUrgency)
  const prefer = new Set<string>()
  for (const e of [...overdue, ...dueToday, ...mine, ...ranked]) {
    if (!e.id || prefer.has(e.id)) continue
    prefer.add(e.id)
    if (prefer.size >= MAX_DEAL_FACTS) break
  }

  const chosen = ranked.filter((e) => prefer.has(e.id)).slice(0, MAX_DEAL_FACTS)
  for (const e of chosen) facts.push(dealLine(e, today))

  if (open.length > chosen.length) {
    facts.push(`${open.length - chosen.length} further open deals not listed (snapshot capped)`)
  }
  return facts
}
