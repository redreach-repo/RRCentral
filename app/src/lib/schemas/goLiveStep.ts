import { z } from 'zod'
import type { BuildStageKey, GoLiveOwner } from '../types'
import { firstZodError } from './common'

const STAGES = [
  'discovery',
  'requirements_signed_off',
  'build',
  'whatsapp_setup',
  'testing',
  'live',
] as const

export type GoLiveStepFormInput = {
  stage: BuildStageKey
  title: string
  owner: GoLiveOwner
  due: string
}

export type GoLiveStepFormParsed = {
  stage: BuildStageKey
  title: string
  owner: GoLiveOwner
  due_date: string | null
}

export const goLiveStepFormSchema = z.object({
  stage: z.enum(STAGES),
  title: z.string().trim().min(1, 'Add a step title'),
  owner: z.enum(['red_reach', 'client']),
  due: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Due date must be YYYY-MM-DD' }),
})

export function parseGoLiveStepForm(
  input: GoLiveStepFormInput,
): { ok: true; data: GoLiveStepFormParsed } | { ok: false; error: string } {
  const result = goLiveStepFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the go-live step') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      stage: d.stage,
      title: d.title,
      owner: d.owner,
      due_date: d.due || null,
    },
  }
}
