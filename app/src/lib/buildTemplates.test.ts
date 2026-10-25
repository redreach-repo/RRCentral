import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUILD_TEMPLATES,
  buildHoursLogged,
  checklistProgress,
  codeFromName,
  configSource,
  copyName,
  planApply,
  tasksByStage,
  templateForPackage,
  templateHours,
} from './buildTemplates'
import { DEFAULT_PACKAGES } from './delivery'
import type { BuildTemplate, BuildTemplateItem } from './types'
import migrationSql from '../../../supabase/migrations/20261106090000_build_templates.sql?raw'
import goLiveSql from '../../../supabase/migrations/20261123090000_go_live_checklist.sql?raw'

function item(partial: Partial<BuildTemplateItem>): BuildTemplateItem {
  return {
    id: crypto.randomUUID(),
    template_id: 't1',
    kind: 'task',
    stage: 'build',
    title: 'Step',
    detail: '',
    est_hours: 1,
    sort: 1,
    ...partial,
  }
}

function template(partial: Partial<BuildTemplate>): BuildTemplate {
  return {
    id: 't1',
    code: 'starter',
    name: 'Starter build',
    description: '',
    package_id: 'p1',
    active: true,
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('default build templates', () => {
  it('has one template per package, close to its build hours target', () => {
    for (const pkg of DEFAULT_PACKAGES) {
      const t = DEFAULT_BUILD_TEMPLATES.find((x) => x.package_code === pkg.code)
      expect(t, pkg.code).toBeTruthy()
      const hours = templateHours(t!.items.map((i) => ({ kind: i.kind, est_hours: i.est_hours ?? 0 })))
      expect(Math.abs(hours - pkg.build_hours_target)).toBeLessThanOrEqual(1)
    }
  })

  it('gives every task a stage and no duplicate lines', () => {
    for (const t of DEFAULT_BUILD_TEMPLATES) {
      expect(t.items.filter((i) => i.kind === 'task').every((i) => i.stage)).toBe(true)
      const keys = t.items.map((i) => `${i.kind}|${i.stage}|${i.title}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('matches the lines the migration adds in Supabase', () => {
    const q = (v: string | null | undefined) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`)
    for (const t of DEFAULT_BUILD_TEMPLATES) {
      expect(migrationSql).toContain(`${q(t.code)}, ${q(t.name)}, ${q(t.description)}`)
      for (const i of t.items) {
        if (i.kind === 'golive') {
          // Seeded by the go live migration (code, stage, title, owner, days, sort).
          expect(goLiveSql).toContain(`(${q(t.code)}, ${q(i.stage)}, ${q(i.title)}, ${q(i.owner)}, ${i.due_days},`)
          continue
        }
        const hours = (i.est_hours ?? 0).toFixed(2)
        expect(migrationSql).toContain(`(${q(t.code)}, ${q(i.kind)}, ${q(i.stage)}, ${q(i.title)}, ${q(i.detail ?? '')}, ${hours},`)
      }
    }
  })

  it('uses no em dashes in the copy', () => {
    const text = JSON.stringify(DEFAULT_BUILD_TEMPLATES)
    expect(text).not.toContain('—')
  })
})

describe('planApply', () => {
  const items = [
    item({ title: 'Kick-off call', stage: 'discovery', sort: 1, est_hours: 1 }),
    item({ title: 'Import contacts', stage: 'build', sort: 2, est_hours: 1.5 }),
    item({ kind: 'config', stage: null, title: 'Pipeline stages', detail: 'New, Won, Lost', sort: 3, est_hours: 0 }),
  ]

  it('copies tasks in stage order and config lines as requirements', () => {
    const plan = planApply(items, [], [])
    expect(plan.tasks.map((t) => t.title)).toEqual(['Kick-off call', 'Import contacts'])
    expect(plan.tasks.map((t) => t.sort)).toEqual([1, 2])
    expect(plan.requirements).toEqual([{ title: 'Pipeline stages', detail: 'New, Won, Lost' }])
    expect(plan.skipped).toBe(0)
  })

  it('skips what the client already has, ignoring case and spaces', () => {
    const plan = planApply(
      items,
      [{ stage: 'build', title: ' import  CONTACTS ', sort: 7 }],
      [{ title: 'pipeline stages' }],
    )
    expect(plan.tasks.map((t) => t.title)).toEqual(['Kick-off call'])
    expect(plan.tasks[0].sort).toBe(8)
    expect(plan.requirements).toEqual([])
    expect(plan.skipped).toBe(2)
  })

  it('treats the same title in another stage as a new task', () => {
    const plan = planApply(items, [{ stage: 'testing', title: 'Import contacts', sort: 1 }], [])
    expect(plan.tasks).toHaveLength(2)
  })

  it('ignores blank lines and tasks without a stage', () => {
    const plan = planApply([item({ title: '  ' }), item({ stage: null, title: 'Lost' })], [], [])
    expect(plan.tasks).toEqual([])
  })
})

describe('checklist helpers', () => {
  it('counts progress and hours left', () => {
    expect(
      checklistProgress([
        { done: true, est_hours: 1 },
        { done: false, est_hours: 1.5 },
        { done: false, est_hours: 0.25 },
      ]),
    ).toEqual({ done: 1, total: 3, estHours: 2.75, estHoursLeft: 1.75 })
  })

  it('groups tasks by stage in build order', () => {
    const groups = tasksByStage([
      { stage: 'live' as const, sort: 1 },
      { stage: 'discovery' as const, sort: 3 },
      { stage: 'discovery' as const, sort: 2 },
    ])
    expect(groups.map((g) => g.stage)).toEqual(['discovery', 'live'])
    expect(groups[0].tasks.map((t) => t.sort)).toEqual([2, 3])
  })

  it('adds up build hours only', () => {
    expect(
      buildHoursLogged([
        { category: 'build', hours: 2 },
        { category: 'support', hours: 5 },
        { category: 'build', hours: 1.25 },
      ]),
    ).toBe(3.25)
  })

  it('suggests the active template for the package', () => {
    const list = [template({ id: 'a', active: false }), template({ id: 'b' }), template({ id: 'c', package_id: 'p2' })]
    expect(templateForPackage(list, 'p1')?.id).toBe('b')
    expect(templateForPackage(list, null)).toBeNull()
    expect(templateForPackage(list, 'p9')).toBeNull()
  })

  it('names copies and codes without clashes', () => {
    expect(copyName('Growth build', [{ name: 'Growth build' }])).toBe('Growth build (copy)')
    expect(copyName('Growth build', [{ name: 'Growth build (copy)' }])).toBe('Growth build (copy 2)')
    expect(codeFromName('Clinic build!', [{ code: 'clinic_build' }])).toBe('clinic_build_2')
    expect(codeFromName('***', [])).toBe('template')
  })

  it('labels requirements copied from a template', () => {
    expect(configSource({ name: 'Growth build' })).toBe('Starter config: Growth build')
  })
})
