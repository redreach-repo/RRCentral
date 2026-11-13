import { z } from 'zod'
import { dueDaysProblem } from '../goLive'
import type { BuildTemplateItemKind, BuildStageKey, GoLiveOwner } from '../types'
import { firstZodError } from './common'

export type BuildTemplateFormInput = {
  name: string
  description: string
  package_id: string
  active: boolean
}

export type BuildTemplateFormParsed = {
  name: string
  description: string
  package_id: string | null
  active: boolean
}

export const buildTemplateFormSchema = z.object({
  name: z.string().trim().min(1, 'Give the template a name'),
  description: z.string(),
  package_id: z.string(),
  active: z.boolean(),
})

export function parseBuildTemplateForm(
  input: BuildTemplateFormInput,
): { ok: true; data: BuildTemplateFormParsed } | { ok: false; error: string } {
  const result = buildTemplateFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the template form') }
  }
  return {
    ok: true,
    data: {
      name: result.data.name,
      description: result.data.description.trim(),
      package_id: result.data.package_id || null,
      active: result.data.active,
    },
  }
}

export type BuildTemplateItemFormInput = {
  kind: BuildTemplateItemKind
  stage: BuildStageKey
  title: string
  detail: string
  hours: string
  owner: GoLiveOwner
  dueDays: string
}

export type BuildTemplateItemFormParsed = {
  kind: BuildTemplateItemKind
  stage: BuildStageKey | null
  title: string
  detail: string
  est_hours: number
  owner: GoLiveOwner
  due_days: number | null
}

export const buildTemplateItemFormSchema = z
  .object({
    kind: z.enum(['task', 'config', 'golive']),
    stage: z.string(),
    title: z.string().trim().min(1, 'Add a title'),
    detail: z.string(),
    hours: z.string(),
    owner: z.string(),
    dueDays: z.string(),
  })
  .superRefine((val, ctx) => {
    const hours = val.hours.trim() === '' ? 0 : Number(val.hours)
    if (!Number.isFinite(hours) || hours < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hours must be a number',
        path: ['hours'],
      })
    }
    if (val.kind === 'golive') {
      const daysProblem = dueDaysProblem(val.dueDays)
      if (daysProblem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: daysProblem,
          path: ['dueDays'],
        })
      }
    }
  })

export function parseBuildTemplateItemForm(
  input: BuildTemplateItemFormInput,
): { ok: true; data: BuildTemplateItemFormParsed } | { ok: false; error: string } {
  const result = buildTemplateItemFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the template line') }
  }
  const d = result.data
  const hours = d.hours.trim() === '' ? 0 : Number(d.hours)
  return {
    ok: true,
    data: {
      kind: d.kind,
      stage: d.kind === 'config' ? null : (d.stage as BuildStageKey),
      title: d.title,
      detail: d.detail.trim(),
      est_hours: d.kind === 'task' ? hours : 0,
      owner: (d.owner as GoLiveOwner) || 'red_reach',
      due_days: d.kind === 'golive' ? Number(d.dueDays) : null,
    },
  }
}
