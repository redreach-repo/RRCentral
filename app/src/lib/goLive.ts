/**
 * Go live checklist (Wave 4, PR R). Each build template carries a short list
 * of what has to happen before the client goes live, who owns each step (Red
 * Reach or the client) and when it is due, counted in days from the date the
 * client signed. Applying the template copies the list onto the client with
 * real due dates; progress shows on the account and in the client portal.
 */
import { addDays, format, parseISO } from 'date-fns'
import type { BuildStageKey, BuildTask, GoLiveOwner } from './types'

export const GO_LIVE_OWNERS: { value: GoLiveOwner; label: string; portalLabel: string }[] = [
  { value: 'red_reach', label: 'Red Reach', portalLabel: 'Red Reach' },
  { value: 'client', label: 'Client', portalLabel: 'You' },
]

export const ownerLabel = (o: string | null | undefined) => GO_LIVE_OWNERS.find((x) => x.value === o)?.label ?? 'Red Reach'

/** Due days are whole days after signing, 0 to 365. */
export const GO_LIVE_MAX_DAYS = 365

export type GoLiveItem = { stage: BuildStageKey; title: string; owner: GoLiveOwner; due_days: number; detail?: string }

const step = (stage: BuildStageKey, owner: GoLiveOwner, due_days: number, title: string, detail = ''): GoLiveItem => ({
  stage,
  owner,
  due_days,
  title,
  detail,
})

/** The go live list per template code (also seeded by the migration). */
export function defaultGoLive(code: string): GoLiveItem[] {
  const goLiveDay = code === 'done_for_you' ? 35 : code === 'growth' ? 28 : 21
  const base: GoLiveItem[] = [
    step('discovery', 'red_reach', 2, 'Kick-off call held and go live date agreed'),
    step('discovery', 'client', 3, 'Send logo, brand colours, team list and contacts spreadsheet'),
    step('requirements_signed_off', 'client', 7, 'Sign off the starter configuration'),
    step('whatsapp_setup', 'client', 7, 'Give access to the WhatsApp Business number and Meta Business account'),
    step('whatsapp_setup', 'red_reach', goLiveDay - 9, 'WhatsApp templates approved by Meta'),
    step('build', 'red_reach', goLiveDay - 7, 'CRM ready with contacts imported and team users added'),
    step('testing', 'client', goLiveDay - 3, 'Team tests with real leads and confirms it works'),
    step('live', 'red_reach', goLiveDay - 1, 'Training call with the client team'),
    step('live', 'red_reach', goLiveDay, 'Go live'),
  ]
  if (code === 'growth' || code === 'done_for_you') {
    base.splice(4, 0, step('build', 'client', 7, 'Share access to the website lead form'))
  }
  if (code === 'done_for_you') {
    base.splice(2, 0, step('discovery', 'client', 5, 'Send the export of the old CRM or spreadsheets'))
    base.splice(base.length - 2, 0, step('build', 'client', goLiveDay - 12, 'Send the FAQ for the AI reply assistant'))
  }
  return base
}

export type SignedSource = {
  deals: { stage: string; signed_at: string | null }[]
  contracts: { status: string; term_start: string | null; created_at: string }[]
}

/**
 * The date the client signed: the latest signed AI CRM deal, else the start
 * of the active contract, else when the contract was made. Null before signing.
 */
export function signedDateFor(src: SignedSource): string | null {
  const signed = src.deals
    .filter((d) => d.stage === 'signed' && d.signed_at)
    .map((d) => String(d.signed_at).slice(0, 10))
    .sort()
  if (signed.length) return signed[signed.length - 1]
  const contracts = src.contracts.filter((c) => c.status === 'active' || c.status === 'draft')
  const active = contracts.find((c) => c.status === 'active' && c.term_start)
  if (active?.term_start) return active.term_start.slice(0, 10)
  const any = contracts.map((c) => c.created_at).filter(Boolean).sort()[0]
  return any ? any.slice(0, 10) : null
}

/** The due date, `YYYY-MM-DD`, or null without a signed date. */
export function goLiveDue(signedDate: string | null, dueDays: number | null | undefined): string | null {
  if (!signedDate || dueDays == null || !Number.isFinite(Number(dueDays))) return null
  return format(addDays(parseISO(signedDate.slice(0, 10)), Math.max(0, Math.round(Number(dueDays)))), 'yyyy-MM-dd')
}

/** Why a due days value is not usable, or null. */
export function dueDaysProblem(raw: string): string | null {
  if (raw.trim() === '') return 'Add the days after signing'
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > GO_LIVE_MAX_DAYS) return `Days after signing must be a whole number from 0 to ${GO_LIVE_MAX_DAYS}`
  return null
}

type GoTask = Pick<BuildTask, 'title' | 'stage' | 'sort' | 'done' | 'done_at'> & {
  kind?: string | null
  owner?: string | null
  due_date?: string | null
}

export const isGoLive = (t: { kind?: string | null }) => t.kind === 'golive'

export type GoLiveProgress = {
  done: number
  total: number
  percent: number
  overdue: number
  /** The next step not done, by due date. */
  next: { title: string; owner: string; due: string | null } | null
  /** The Go live step's due date, when there is one. */
  goLiveDate: string | null
  live: boolean
}

const byDue = <T extends GoTask>(a: T, b: T) =>
  String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || a.sort - b.sort

/** Go live steps in the order they are due. */
export function goLiveSteps<T extends GoTask>(tasks: T[]): T[] {
  return tasks.filter(isGoLive).sort(byDue)
}

export function isOverdue(t: GoTask, today: string): boolean {
  return !t.done && Boolean(t.due_date) && String(t.due_date) < today
}

export function goLiveProgress(tasks: GoTask[], today: string): GoLiveProgress {
  const steps = goLiveSteps(tasks)
  const done = steps.filter((t) => t.done).length
  const open = steps.filter((t) => !t.done)
  const last = steps.find((t) => /^go live$/i.test(t.title.trim())) ?? steps[steps.length - 1]
  return {
    done,
    total: steps.length,
    percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
    overdue: steps.filter((t) => isOverdue(t, today)).length,
    next: open[0] ? { title: open[0].title, owner: ownerLabel(open[0].owner), due: open[0].due_date || null } : null,
    goLiveDate: last?.due_date || null,
    live: steps.length > 0 && done === steps.length,
  }
}

export type PortalGoLiveStep = { title: string; who: string; due: string | null; done: boolean; late: boolean }
export type PortalGoLive = { done: number; total: number; percent: number; goLiveDate: string | null; steps: PortalGoLiveStep[] }

const day = (iso: string) => format(parseISO(iso.slice(0, 10)), 'd MMM yyyy')

/** What the client sees: each step, who owns it ("You" or Red Reach), and when it is due. */
export function portalGoLive(tasks: GoTask[], today: string): PortalGoLive | null {
  const steps = goLiveSteps(tasks)
  if (!steps.length) return null
  const p = goLiveProgress(steps, today)
  return {
    done: p.done,
    total: p.total,
    percent: p.percent,
    goLiveDate: p.goLiveDate ? day(p.goLiveDate) : null,
    steps: steps.map((t) => ({
      title: t.title,
      who: GO_LIVE_OWNERS.find((o) => o.value === t.owner)?.portalLabel ?? 'Red Reach',
      due: t.due_date ? day(t.due_date) : null,
      done: t.done,
      late: isOverdue(t, today),
    })),
  }
}
