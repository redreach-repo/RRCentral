import { z } from 'zod'
import { sessionProblem, type SessionDraft } from '../ctrmSessions'
import type { CtrmSessionKind } from '../types'
import { firstZodError } from './common'

const SESSION_KINDS = ['demo', 'training', 'workshop', 'review'] as const

export type CtrmSessionFormInput = {
  kind: CtrmSessionKind
  session_date: string
  attendees: string
  topics_covered: string[]
  topics_left: string[]
  recording_url: string
  follow_up_due: string | null
  notes: string
}

export const ctrmSessionFormSchema = z
  .object({
    kind: z.enum(SESSION_KINDS),
    session_date: z.string(),
    attendees: z.string(),
    topics_covered: z.array(z.string()),
    topics_left: z.array(z.string()),
    recording_url: z.string(),
    follow_up_due: z.string().nullable(),
    notes: z.string(),
  })
  .superRefine((val, ctx) => {
    const problem = sessionProblem(val as SessionDraft)
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
    }
  })

export function parseCtrmSessionForm(
  input: CtrmSessionFormInput,
): { ok: true; data: SessionDraft } | { ok: false; error: string } {
  const result = ctrmSessionFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the session form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      kind: d.kind,
      session_date: d.session_date,
      attendees: d.attendees.trim(),
      topics_covered: d.topics_covered,
      topics_left: d.topics_left,
      recording_url: d.recording_url.trim(),
      follow_up_due: d.follow_up_due,
      notes: d.notes.trim(),
    },
  }
}
