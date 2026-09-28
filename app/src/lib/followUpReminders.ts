import { format } from 'date-fns'
import { computeDueCounts } from './crmWorkQueue'
import type { CrmEntry } from './types'

/** Deals in these stages don't need follow-ups. */
const CLOSED_STAGES = new Set(['Won', 'Lost'])

export type ReminderCounts = { overdue: number; today: number; mine: number }

/** Overdue / due-today follow-ups on open deals; `mine` counts those owned by `ownerName`. */
export function reminderCounts(entries: CrmEntry[], ownerName: string, today = new Date()): ReminderCounts {
  const open = entries.filter((e) => !CLOSED_STAGES.has(e.pipeline_stage || ''))
  const all = computeDueCounts(open, '', today)
  const mineDue = ownerName
    ? computeDueCounts(
        open.filter((e) => (e.owner || '') === ownerName),
        '',
        today,
      )
    : { overdue: 0, today: 0 }
  return { overdue: all.overdue, today: all.today, mine: mineDue.overdue + mineDue.today }
}

export function reminderMessage(counts: ReminderCounts): string {
  const parts: string[] = []
  if (counts.overdue) parts.push(`${counts.overdue} overdue`)
  if (counts.today) parts.push(`${counts.today} due today`)
  return parts.length ? `Follow-ups: ${parts.join(', ')}` : ''
}

const NOTIFIED_KEY = 'rrcentral_followup_notified'

/** True once per calendar day per browser. */
export function shouldNotifyToday(now = new Date(), storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  const today = format(now, 'yyyy-MM-dd')
  try {
    return storage?.getItem(NOTIFIED_KEY) !== today
  } catch {
    return true
  }
}

export function markNotifiedToday(now = new Date(), storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(NOTIFIED_KEY, format(now, 'yyyy-MM-dd'))
  } catch {
    // private mode — notify again next load, harmless
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
