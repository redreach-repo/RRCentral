import { BUILD_STAGES } from './delivery'
import { defaultGoLive, goLiveDue } from './goLive'
import type {
  BuildStageKey,
  BuildTask,
  BuildTemplate,
  BuildTemplateItem,
  BuildTemplateItemKind,
  Requirement,
  TimeEntry,
  GoLiveOwner,
} from './types'

/**
 * Build templates: a cloneable build checklist and starter configuration per
 * package. Applying one to a client copies its tasks into the client's build
 * checklist and its starter configuration lines into the client's
 * requirements, so each build starts from a known list instead of a blank page.
 */

type DefaultItem = {
  kind: BuildTemplateItemKind
  stage: BuildStageKey | null
  title: string
  detail?: string
  est_hours?: number
  owner?: GoLiveOwner
  due_days?: number
}

export type DefaultBuildTemplate = {
  code: string
  /** delivery_packages.code this template belongs to. */
  package_code: string
  name: string
  description: string
  items: DefaultItem[]
}

const task = (stage: BuildStageKey, title: string, est_hours: number, detail = ''): DefaultItem => ({
  kind: 'task',
  stage,
  title,
  detail,
  est_hours,
})
const config = (title: string, detail: string): DefaultItem => ({ kind: 'config', stage: null, title, detail })

const STARTER_TASKS: DefaultItem[] = [
  task('discovery', 'Kick-off call', 1, 'Agree goals, who does what, and the go-live date.'),
  task('discovery', 'Collect logo, brand colours, team list and contact spreadsheet', 0.5),
  task('requirements_signed_off', 'Walk the client through the starter configuration and get sign-off', 0.5),
  task('build', 'Create the CRM workspace from the starter configuration', 1),
  task('build', 'Set up pipeline stages and contact fields', 1),
  task('build', 'Import contacts from the client spreadsheet', 1.5),
  task('build', 'Add team users and roles', 0.5),
  task('whatsapp_setup', 'Connect the WhatsApp Business number', 1),
  task('whatsapp_setup', 'Submit message templates to Meta for approval', 1),
  task('whatsapp_setup', 'Set up the welcome auto reply', 0.5),
  task('testing', 'Test a lead from first message to won', 1),
  task('testing', 'Test WhatsApp send and receive on a real phone', 0.5),
  task('live', 'Training call with the client team', 1),
  task('live', 'Send handover notes and how to reach support', 0.5),
  task('live', 'Book the first monthly report call', 0.25),
]

const STARTER_CONFIG: DefaultItem[] = [
  config('Pipeline stages', 'New lead, Contacted, Qualified, Quote sent, Won, Lost.'),
  config('Contact fields', 'Name, WhatsApp number, Email, Source, Interest, Owner.'),
  config('WhatsApp templates', 'Welcome, Follow up after 2 days, Appointment reminder.'),
  config('Monthly report', 'New leads by source, conversion rate, WhatsApp conversations used.'),
]

const GROWTH_TASKS: DefaultItem[] = [
  ...STARTER_TASKS,
  task('discovery', 'Map the current lead sources and follow-up process', 1),
  task('build', 'Connect the website lead form', 1.5),
  task('build', 'Set up follow-up reminders and task automations', 2),
  task('build', 'Set up lead scoring', 1),
  task('build', 'Build the team dashboard', 1),
  task('whatsapp_setup', 'Set up broadcast lists by segment', 1),
  task('testing', 'Test automations fire on time', 1),
]

const GROWTH_CONFIG: DefaultItem[] = [
  ...STARTER_CONFIG,
  config('Automations', 'Follow-up task 2 days after no reply. Move to Lost after 30 days quiet. Notify owner on new lead.'),
  config('Lead scoring', 'Points for source, budget and reply speed. Hot leads shown first.'),
  config('Segments', 'Broadcast lists for new leads, past customers and inactive contacts.'),
]

const DONE_FOR_YOU_TASKS: DefaultItem[] = [
  ...GROWTH_TASKS,
  task('discovery', 'Review the old CRM or spreadsheets for data to migrate', 1),
  task('build', 'Migrate history from the old CRM', 2.5),
  task('build', 'Set up the AI reply assistant with the client FAQ', 2.5),
  task('build', 'Build custom reports for the owner', 1.5),
  task('testing', 'Client team tests with real leads for a week', 1),
  task('live', 'Second training call for managers', 1),
]

const DONE_FOR_YOU_CONFIG: DefaultItem[] = [
  ...GROWTH_CONFIG,
  config('AI reply assistant', 'Answers common questions on WhatsApp from the client FAQ and hands over to a person when unsure.'),
  config('Owner reports', 'Weekly pipeline value, team response times, revenue won by source.'),
]

function goLiveItems(code: string): DefaultItem[] {
  return defaultGoLive(code).map((g) => ({ kind: 'golive', stage: g.stage, title: g.title, detail: g.detail, owner: g.owner, due_days: g.due_days }))
}

export const DEFAULT_BUILD_TEMPLATES: DefaultBuildTemplate[] = [
  {
    code: 'starter',
    package_code: 'starter',
    name: 'Starter build',
    description: 'Core CRM, contacts and WhatsApp. Aim for about 12 build hours.',
    items: [...STARTER_TASKS, ...STARTER_CONFIG, ...goLiveItems('starter')],
  },
  {
    code: 'growth',
    package_code: 'growth',
    name: 'Growth build',
    description: 'Starter plus website leads, automations and lead scoring. Aim for about 20 build hours.',
    items: [...GROWTH_TASKS, ...GROWTH_CONFIG, ...goLiveItems('growth')],
  },
  {
    code: 'done_for_you',
    package_code: 'done_for_you',
    name: 'Done for you build',
    description: 'Growth plus data migration, AI replies and owner reports. Aim for about 30 build hours.',
    items: [...DONE_FOR_YOU_TASKS, ...DONE_FOR_YOU_CONFIG, ...goLiveItems('done_for_you')],
  },
]

/** The source label put on requirements copied from a template. */
export function configSource(template: Pick<BuildTemplate, 'name'>): string {
  return `Starter config: ${template.name}`
}

function key(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const STAGE_ORDER = new Map(BUILD_STAGES.map((s, i) => [s.value, i]))

/** Items in checklist order: by build stage, then the template's own order. */
export function sortItems<T extends { stage: BuildStageKey | null; sort: number }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (STAGE_ORDER.get(a.stage as BuildStageKey) ?? 99) - (STAGE_ORDER.get(b.stage as BuildStageKey) ?? 99) || a.sort - b.sort,
  )
}

/** Total estimated hours of a template's tasks. */
export function templateHours(items: Pick<BuildTemplateItem, 'kind' | 'est_hours'>[]): number {
  return round2(items.filter((i) => i.kind === 'task').reduce((sum, i) => sum + (Number(i.est_hours) || 0), 0))
}

/** The template to suggest for a client: the active one for their package, else none. */
export function templateForPackage(templates: BuildTemplate[], packageId: string | null | undefined): BuildTemplate | null {
  if (!packageId) return null
  return templates.find((t) => t.active && t.package_id === packageId) ?? null
}

export type ApplyPlan = {
  tasks: (Pick<BuildTask, 'stage' | 'title' | 'detail' | 'est_hours' | 'sort'> &
    Partial<Pick<BuildTask, 'kind' | 'owner' | 'due_days' | 'due_date'>>)[]
  requirements: Pick<Requirement, 'title' | 'detail'>[]
  /** Lines already on the client, left alone. */
  skipped: number
}

/**
 * What applying a template adds to a client. Tasks already on the checklist
 * (same stage and title) and requirements with the same title are skipped,
 * so applying twice, or applying Growth after Starter, never doubles up.
 * Go live steps get their due date from the signed date (none before signing).
 */
export function planApply(
  items: BuildTemplateItem[],
  existingTasks: (Pick<BuildTask, 'stage' | 'title' | 'sort'> & { kind?: string | null })[],
  existingRequirements: Pick<Requirement, 'title'>[],
  signedDate: string | null = null,
): ApplyPlan {
  const taskKey = (kind: string | null | undefined, stage: string | null, title: string) =>
    `${kind === 'golive' ? 'golive' : 'task'}|${stage}|${key(title)}`
  const haveTasks = new Set(existingTasks.map((t) => taskKey(t.kind, t.stage, t.title)))
  const haveReqs = new Set(existingRequirements.map((r) => key(r.title)))
  let nextSort = existingTasks.reduce((max, t) => Math.max(max, t.sort), 0)
  const plan: ApplyPlan = { tasks: [], requirements: [], skipped: 0 }
  for (const item of sortItems(items)) {
    if (!item.title.trim()) continue
    if (item.kind === 'task' || item.kind === 'golive') {
      if (!item.stage) continue
      const k = taskKey(item.kind, item.stage, item.title)
      if (haveTasks.has(k)) {
        plan.skipped++
        continue
      }
      haveTasks.add(k)
      nextSort += 1
      plan.tasks.push(
        item.kind === 'golive'
          ? {
              stage: item.stage,
              title: item.title.trim(),
              detail: item.detail,
              est_hours: 0,
              sort: nextSort,
              kind: 'golive',
              owner: item.owner === 'client' ? 'client' : 'red_reach',
              due_days: item.due_days ?? null,
              due_date: goLiveDue(signedDate, item.due_days),
            }
          : {
              stage: item.stage,
              title: item.title.trim(),
              detail: item.detail,
              est_hours: Number(item.est_hours) || 0,
              sort: nextSort,
            },
      )
    } else {
      const k = key(item.title)
      if (haveReqs.has(k)) {
        plan.skipped++
        continue
      }
      haveReqs.add(k)
      plan.requirements.push({ title: item.title.trim(), detail: item.detail })
    }
  }
  return plan
}

export type ChecklistProgress = {
  done: number
  total: number
  estHours: number
  estHoursLeft: number
}

export function checklistProgress(tasks: Pick<BuildTask, 'done' | 'est_hours'>[]): ChecklistProgress {
  const done = tasks.filter((t) => t.done)
  const estHours = round2(tasks.reduce((sum, t) => sum + (Number(t.est_hours) || 0), 0))
  const doneHours = round2(done.reduce((sum, t) => sum + (Number(t.est_hours) || 0), 0))
  return { done: done.length, total: tasks.length, estHours, estHoursLeft: round2(estHours - doneHours) }
}

/** Tasks grouped by build stage, in stage order. Stages with no tasks are left out. */
export function tasksByStage<T extends Pick<BuildTask, 'stage' | 'sort'>>(tasks: T[]): { stage: BuildStageKey; label: string; tasks: T[] }[] {
  return BUILD_STAGES.map((s) => ({
    stage: s.value,
    label: s.label,
    tasks: tasks.filter((t) => t.stage === s.value).sort((a, b) => a.sort - b.sort),
  })).filter((g) => g.tasks.length > 0)
}

/** A copy's name that does not clash with existing templates. */
export function copyName(name: string, existing: Pick<BuildTemplate, 'name'>[]): string {
  const names = new Set(existing.map((t) => key(t.name)))
  let candidate = `${name} (copy)`
  let n = 2
  while (names.has(key(candidate))) candidate = `${name} (copy ${n++})`
  return candidate
}

/** A unique code from a name, for new and copied templates. */
export function codeFromName(name: string, existing: Pick<BuildTemplate, 'code'>[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'template'
  const codes = new Set(existing.map((t) => t.code))
  let candidate = base
  let n = 2
  while (codes.has(candidate)) candidate = `${base}_${n++}`
  return candidate
}

/** All hours logged as Build on a client, to set against the package's build hours target. */
export function buildHoursLogged(entries: Pick<TimeEntry, 'category' | 'hours'>[]): number {
  return round2(entries.filter((e) => e.category === 'build').reduce((sum, e) => sum + (Number(e.hours) || 0), 0))
}
