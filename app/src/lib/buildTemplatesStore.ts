import { currentAuthMode, db } from './db'
import { isMissingRelationError } from './errors'
import { DEFAULT_BUILD_TEMPLATES, configSource, planApply } from './buildTemplates'
import { listPackages } from './deliveryStore'
import { goLiveDue, isGoLive, signedDateFor } from './goLive'
import type { BuildStageKey, BuildTask, BuildTemplate, BuildTemplateItem, Requirement } from './types'

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

let seeding: Promise<void> | null = null

/** All templates, seeded in local mode the first time they are read. */
export async function listBuildTemplates(): Promise<BuildTemplate[]> {
  if (seeding) await seeding
  let list = await rows<BuildTemplate>(db.from('build_templates').select('*').order('name'))
  if (list.length === 0 && currentAuthMode() === 'local') {
    seeding ??= seedTemplates().finally(() => {
      seeding = null
    })
    await seeding
    list = await rows<BuildTemplate>(db.from('build_templates').select('*').order('name'))
  }
  return [...list].sort((a, b) => a.name.localeCompare(b.name))
}

async function seedTemplates(): Promise<void> {
  const existing = await rows<BuildTemplate>(db.from('build_templates').select('id'))
  if (existing.length) return
  const packages = await listPackages()
  const now = new Date().toISOString()
  for (const t of DEFAULT_BUILD_TEMPLATES) {
    const id = crypto.randomUUID()
    check(
      await db.from('build_templates').insert({
        id,
        code: t.code,
        name: t.name,
        description: t.description,
        package_id: packages.find((p) => p.code === t.package_code)?.id ?? null,
        active: true,
        created_at: now,
        updated_at: now,
      }),
    )
    check(
      await db
        .from('build_template_items')
        .insert(t.items.map((item, i) => ({ id: crypto.randomUUID(), template_id: id, detail: '', est_hours: 0, ...item, sort: i + 1 }))),
    )
  }
}

export async function listTemplateItems(templateId?: string): Promise<BuildTemplateItem[]> {
  let q = db.from('build_template_items').select('*')
  if (templateId) q = q.eq('template_id', templateId)
  return rows<BuildTemplateItem>(q.order('sort'))
}

export type TemplateInput = Pick<BuildTemplate, 'code' | 'name' | 'description' | 'package_id' | 'active'>

/** Save a template and return its id. */
export async function saveBuildTemplate(input: TemplateInput, id?: string): Promise<string> {
  const now = new Date().toISOString()
  if (id) {
    check(await db.from('build_templates').update({ ...input, updated_at: now }).eq('id', id))
    return id
  }
  const newId = crypto.randomUUID()
  check(await db.from('build_templates').insert({ ...input, id: newId, created_at: now, updated_at: now }))
  return newId
}

export async function deleteBuildTemplate(id: string): Promise<void> {
  // Local mode has no cascade, so remove the lines first.
  check(await db.from('build_template_items').delete().eq('template_id', id))
  check(await db.from('build_templates').delete().eq('id', id))
}

/** Copy a template and all its lines under a new name. Returns the new id. */
export async function copyBuildTemplate(source: BuildTemplate, input: TemplateInput): Promise<string> {
  const items = await listTemplateItems(source.id)
  const newId = await saveBuildTemplate(input)
  if (items.length) {
    check(
      await db.from('build_template_items').insert(
        items.map(({ id: _id, template_id: _t, ...rest }) => ({ ...rest, id: crypto.randomUUID(), template_id: newId })),
      ),
    )
  }
  return newId
}

export type TemplateItemInput = Pick<BuildTemplateItem, 'kind' | 'stage' | 'title' | 'detail' | 'est_hours' | 'sort' | 'owner' | 'due_days'>

export async function saveTemplateItem(templateId: string, input: TemplateItemInput, id?: string): Promise<void> {
  const golive = input.kind === 'golive'
  const row = {
    ...input,
    stage: input.kind === 'config' ? null : input.stage,
    owner: golive ? input.owner ?? 'red_reach' : 'red_reach',
    due_days: golive ? input.due_days ?? 0 : null,
  }
  if (id) {
    check(await db.from('build_template_items').update(row).eq('id', id))
  } else {
    check(await db.from('build_template_items').insert({ ...row, id: crypto.randomUUID(), template_id: templateId }))
  }
  check(await db.from('build_templates').update({ updated_at: new Date().toISOString() }).eq('id', templateId))
}

export async function deleteTemplateItem(id: string): Promise<void> {
  check(await db.from('build_template_items').delete().eq('id', id))
}

export async function listBuildTasks(accountId: string): Promise<BuildTask[]> {
  return rows<BuildTask>(db.from('build_tasks').select('*').eq('account_id', accountId).order('sort'))
}

export async function addBuildTask(
  accountId: string,
  input: Pick<BuildTask, 'stage' | 'title' | 'detail' | 'est_hours'>,
  existing: Pick<BuildTask, 'sort'>[],
): Promise<void> {
  check(
    await db.from('build_tasks').insert({
      ...input,
      id: crypto.randomUUID(),
      account_id: accountId,
      template_id: null,
      done: false,
      done_at: null,
      done_by: '',
      sort: existing.reduce((max, t) => Math.max(max, t.sort), 0) + 1,
      created_at: new Date().toISOString(),
    }),
  )
}

export async function setBuildTaskDone(id: string, done: boolean, by: string): Promise<void> {
  check(
    await db
      .from('build_tasks')
      .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? by : '' })
      .eq('id', id),
  )
}

export async function deleteBuildTask(id: string): Promise<void> {
  check(await db.from('build_tasks').delete().eq('id', id))
}

/**
 * Copy a template onto a client: its tasks into the build checklist and its
 * starter configuration into requirements. Lines the client already has are
 * skipped. Returns how many of each were added.
 */
export async function applyBuildTemplate(
  accountId: string,
  template: BuildTemplate,
  existingTasks: (Pick<BuildTask, 'stage' | 'title' | 'sort'> & { kind?: string | null })[],
  existingRequirements: Pick<Requirement, 'title'>[],
  createdBy: string,
): Promise<{ tasks: number; requirements: number; goLive: number; skipped: number }> {
  const items = await listTemplateItems(template.id)
  const plan = planApply(items, existingTasks, existingRequirements, await signedDateForAccount(accountId))
  const now = new Date().toISOString()
  if (plan.tasks.length) {
    check(
      await db.from('build_tasks').insert(
        plan.tasks.map((t) => ({
          ...t,
          stage: t.stage as BuildStageKey,
          id: crypto.randomUUID(),
          account_id: accountId,
          template_id: template.id,
          done: false,
          done_at: null,
          done_by: '',
          created_at: now,
        })),
      ),
    )
  }
  if (plan.requirements.length) {
    check(
      await db.from('requirements').insert(
        plan.requirements.map((r) => ({
          ...r,
          id: crypto.randomUUID(),
          account_id: accountId,
          status: 'open',
          source: configSource(template),
          is_change_request: false,
          created_by: createdBy,
          created_at: now,
        })),
      ),
    )
  }
  const goLive = plan.tasks.filter(isGoLive).length
  return { tasks: plan.tasks.length - goLive, requirements: plan.requirements.length, goLive, skipped: plan.skipped }
}

/** When the client signed (see signedDateFor), or null before signing. */
export async function signedDateForAccount(accountId: string): Promise<string | null> {
  const [deals, contracts] = await Promise.all([
    rows<{ stage: string; signed_at: string | null }>(db.from('sales_deals').select('stage, signed_at').eq('account_id', accountId)),
    rows<{ status: string; term_start: string | null; created_at: string }>(
      db.from('contracts').select('status, term_start, created_at').eq('account_id', accountId),
    ),
  ])
  return signedDateFor({ deals, contracts })
}

/** Sets every open go live step's due date from the signed date. Returns how many changed. */
export async function refreshGoLiveDates(tasks: BuildTask[], signedDate: string): Promise<number> {
  let changed = 0
  for (const t of tasks) {
    if (!isGoLive(t) || t.done || t.due_days == null) continue
    const due = goLiveDue(signedDate, t.due_days)
    if (due === (t.due_date ?? null)) continue
    check(await db.from('build_tasks').update({ due_date: due }).eq('id', t.id))
    changed++
  }
  return changed
}

export async function updateGoLiveStep(id: string, fields: Partial<Pick<BuildTask, 'owner' | 'owner_user_id' | 'due_date'>>): Promise<void> {
  check(await db.from('build_tasks').update(fields).eq('id', id))
}

export async function addGoLiveStep(
  accountId: string,
  input: Pick<BuildTask, 'stage' | 'title' | 'owner' | 'due_date'>,
  existing: Pick<BuildTask, 'sort'>[],
): Promise<void> {
  check(
    await db.from('build_tasks').insert({
      ...input,
      id: crypto.randomUUID(),
      account_id: accountId,
      template_id: null,
      kind: 'golive',
      detail: '',
      est_hours: 0,
      due_days: null,
      owner_user_id: null,
      done: false,
      done_at: null,
      done_by: '',
      sort: existing.reduce((max, t) => Math.max(max, t.sort), 0) + 1,
      created_at: new Date().toISOString(),
    }),
  )
}
