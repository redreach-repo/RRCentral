import { z } from 'zod'
import { WORKFLOW_TRIGGERS, type WorkflowTriggerType } from '../workflows'
import { firstZodError } from './common'

const triggers = WORKFLOW_TRIGGERS.map((t) => t.value) as unknown as [string, ...string[]]

export type WorkflowDefinitionFormInput = {
  name: string
  description: string
  trigger_type: string
  pipeline_key: string
  stage_key: string
  approver_role: string
  notify_message: string
  active: boolean
}

export type WorkflowDefinitionFormParsed = {
  name: string
  description: string
  trigger_type: WorkflowTriggerType
  pipeline_key: string
  stage_key: string
  approver_role: string
  notify_message: string
  active: boolean
}

export const workflowDefinitionFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string(),
    trigger_type: z.enum(triggers, { message: 'Pick a trigger' }),
    pipeline_key: z.string(),
    stage_key: z.string(),
    approver_role: z.string(),
    notify_message: z.string(),
    active: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.trigger_type === 'stage_enter') {
      if (!val.pipeline_key.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Pipeline key is required for stage-enter triggers',
          path: ['pipeline_key'],
        })
      }
      if (!val.stage_key.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Stage key is required for stage-enter triggers',
          path: ['stage_key'],
        })
      }
    }
  })

export function parseWorkflowDefinitionForm(
  input: WorkflowDefinitionFormInput,
): { ok: true; data: WorkflowDefinitionFormParsed } | { ok: false; error: string } {
  const result = workflowDefinitionFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the workflow form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      name: d.name,
      description: d.description.trim(),
      trigger_type: d.trigger_type as WorkflowTriggerType,
      pipeline_key: d.pipeline_key.trim(),
      stage_key: d.stage_key.trim(),
      approver_role: d.approver_role.trim() || 'admin',
      notify_message: d.notify_message.trim(),
      active: d.active,
    },
  }
}
