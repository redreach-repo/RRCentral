import { z } from 'zod'
import type { BuildStageKey } from '../types'
import { firstZodError } from './common'

const STAGES = [
  'discovery',
  'requirements_signed_off',
  'build',
  'whatsapp_setup',
  'testing',
  'live',
] as const

export type BuildTaskFormInput = {
  stage: BuildStageKey
  title: string
  hours: string
}

export type BuildTaskFormParsed = {
  stage: BuildStageKey
  title: string
  est_hours: number
}

export const buildTaskFormSchema = z
  .object({
    stage: z.enum(STAGES),
    title: z.string().trim().min(1, 'Add a task title'),
    hours: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    if (val.hours === '') return
    const n = Number(val.hours)
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hours'], message: 'Hours must be a number' })
    }
  })

export function parseBuildTaskForm(
  input: BuildTaskFormInput,
): { ok: true; data: BuildTaskFormParsed } | { ok: false; error: string } {
  const result = buildTaskFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the build task') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      stage: d.stage,
      title: d.title,
      est_hours: d.hours === '' ? 0 : Number(d.hours),
    },
  }
}
