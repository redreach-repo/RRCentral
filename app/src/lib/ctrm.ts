import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'
import type { CtrmCompanyType, CtrmDeal, CtrmRegion, CtrmStage, CtrmStageChange } from './types'

/** Pipeline stages in order. */
export const CTRM_STAGES: { value: CtrmStage; label: string }[] = [
  { value: 'identified', label: 'Identified' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'intro_call_booked', label: 'Intro call booked' },
  { value: 'demo_done', label: 'Demo done' },
  { value: 'evaluating', label: 'Evaluating' },
  { value: 'decision_pending', label: 'Decision pending' },
  { value: 'signed', label: 'Signed' },
  { value: 'lost', label: 'Lost' },
]

export const CTRM_REGIONS: { value: CtrmRegion; label: string }[] = [
  { value: 'middle_east', label: 'Middle East' },
  { value: 'india', label: 'India' },
]

export const CTRM_COMPANY_TYPES: { value: CtrmCompanyType; label: string }[] = [
  { value: 'trading_house', label: 'Trading house' },
  { value: 'energy', label: 'Energy business' },
  { value: 'other', label: 'Other' },
]

/** No touch for this many days makes a deal stale. */
export const STALE_DAYS = 14

export function stageLabel(stage: string): string {
  return CTRM_STAGES.find((s) => s.value === stage)?.label ?? stage
}

export function regionLabel(region: string): string {
  return CTRM_REGIONS.find((r) => r.value === region)?.label ?? region
}

export function companyTypeLabel(type: string): string {
  return CTRM_COMPANY_TYPES.find((t) => t.value === type)?.label ?? type
}

export function isOpenDeal(d: Pick<CtrmDeal, 'stage'>): boolean {
  return d.stage !== 'signed' && d.stage !== 'lost'
}

/** Open deals nobody has touched for 14 days or more. */
export function isStale(d: Pick<CtrmDeal, 'stage' | 'last_touch_at'>, now: Date = new Date()): boolean {
  if (!isOpenDeal(d)) return false
  return differenceInCalendarDays(now, parseISO(d.last_touch_at)) >= STALE_DAYS
}

/** Open deals whose next action date has passed. */
export function isOverdue(d: Pick<CtrmDeal, 'stage' | 'next_action_date'>, now: Date = new Date()): boolean {
  if (!isOpenDeal(d) || !d.next_action_date) return false
  return d.next_action_date < format(now, 'yyyy-MM-dd')
}

export type DealDraft = Pick<CtrmDeal, 'stage' | 'next_action' | 'next_action_date' | 'lost_reason'>

/** The rules a deal must meet before it is saved. Returns a message, or null when it is fine. */
export function dealProblem(d: DealDraft): string | null {
  if (d.stage === 'lost' && !d.lost_reason.trim()) return 'Say why the deal was lost'
  if (isOpenDeal(d)) {
    if (!d.next_action.trim()) return 'Every open deal needs a next action'
    if (!d.next_action_date) return 'Give the next action a date'
  }
  return null
}

export type WeeklySummary = {
  weekStart: string
  weekEnd: string
  byStage: { stage: CtrmStage; label: string; count: number }[]
  newThisWeek: { name: string; region: string; stage: string }[]
  callsBooked: string[]
  demosDone: string[]
  signed: string[]
  nextSteps: { name: string; stage: string; action: string; date: string }[]
}

/**
 * The weekly update for CTRM Next. It takes names from the caller and never
 * sees commission or fee data, so none can leak into it.
 */
export function weeklySummary(
  deals: Pick<CtrmDeal, 'id' | 'stage' | 'region' | 'created_at' | 'next_action' | 'next_action_date'>[],
  changes: Pick<CtrmStageChange, 'deal_id' | 'to_stage' | 'changed_at'>[],
  nameOf: (dealId: string) => string,
  anyDayInWeek: Date,
): WeeklySummary {
  const start = startOfWeek(anyDayInWeek, { weekStartsOn: 1 })
  const end = addDays(start, 7)
  const inWeek = (iso: string) => {
    const t = parseISO(iso).getTime()
    return t >= start.getTime() && t < end.getTime()
  }
  const movedTo = (stage: CtrmStage) => [
    ...new Set(changes.filter((c) => c.to_stage === stage && inWeek(c.changed_at)).map((c) => nameOf(c.deal_id))),
  ]
  return {
    weekStart: format(start, 'yyyy-MM-dd'),
    weekEnd: format(addDays(start, 6), 'yyyy-MM-dd'),
    byStage: CTRM_STAGES.map((s) => ({ stage: s.value, label: s.label, count: deals.filter((d) => d.stage === s.value).length })),
    newThisWeek: deals
      .filter((d) => inWeek(d.created_at))
      .map((d) => ({ name: nameOf(d.id), region: regionLabel(d.region), stage: stageLabel(d.stage) })),
    callsBooked: movedTo('intro_call_booked'),
    demosDone: movedTo('demo_done'),
    signed: movedTo('signed'),
    nextSteps: deals
      .filter((d) => isOpenDeal(d) && d.next_action_date)
      .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))
      .map((d) => ({
        name: nameOf(d.id),
        stage: stageLabel(d.stage),
        action: d.next_action,
        date: String(d.next_action_date),
      })),
  }
}

/** Plain text version of the summary, to paste into an email or WhatsApp. */
export function summaryText(s: WeeklySummary): string {
  const nice = (iso: string) => format(parseISO(iso), 'd MMM yyyy')
  const list = (items: string[]) => (items.length ? items.join(', ') : 'None')
  const lines = [
    `CTRM Next pipeline, week of ${nice(s.weekStart)} to ${nice(s.weekEnd)}`,
    '',
    'Deals by stage',
    ...s.byStage.map((b) => `${b.label}: ${b.count}`),
    '',
    `New this week: ${s.newThisWeek.length ? s.newThisWeek.map((n) => `${n.name} (${n.region})`).join(', ') : 'None'}`,
    `Intro calls booked: ${list(s.callsBooked)}`,
    `Demos done: ${list(s.demosDone)}`,
    `Signed: ${list(s.signed)}`,
    '',
    'Next steps',
    ...(s.nextSteps.length ? s.nextSteps.map((n) => `${nice(n.date)}, ${n.name}: ${n.action}`) : ['None']),
  ]
  return lines.join('\n')
}
