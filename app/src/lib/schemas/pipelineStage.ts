import { z } from 'zod'
import { PIPELINE_OUTCOMES, type PipelineOutcome } from '../pipelines'
import { firstZodError } from './common'

const outcomes = PIPELINE_OUTCOMES.map((o) => o.value) as unknown as [string, ...string[]]

export type PipelineStageFormInput = {
  label: string
  color: string
  outcome: string
  sort_order: number
  active: boolean
}

export type PipelineStageFormParsed = {
  label: string
  color: string
  outcome: PipelineOutcome
  sort_order: number
  active: boolean
}

export const pipelineStageFormSchema = z.object({
  label: z.string().trim().min(1, 'Label is required'),
  color: z.string(),
  outcome: z.enum(outcomes, { message: 'Pick an outcome' }),
  sort_order: z.number().finite(),
  active: z.boolean(),
})

export function parsePipelineStageForm(
  input: PipelineStageFormInput,
): { ok: true; data: PipelineStageFormParsed } | { ok: false; error: string } {
  const result = pipelineStageFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the stage form') }
  }
  return {
    ok: true,
    data: {
      label: result.data.label,
      color: result.data.color.trim(),
      outcome: result.data.outcome as PipelineOutcome,
      sort_order: result.data.sort_order,
      active: result.data.active,
    },
  }
}
