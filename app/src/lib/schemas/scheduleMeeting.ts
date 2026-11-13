import { z } from 'zod'
import { firstZodError } from './common'

export type ScheduleMeetingFormInput = {
  title: string
  date: string
  time: string
  duration: string
  location: string
  notes: string
  attendeeEmails: string[]
}

export type ScheduleMeetingFormParsed = {
  title: string
  date: string
  startHour: number
  startMinute: number
  durationMinutes: number
  location: string
  description: string
  attendeeEmails: string[]
}

export const scheduleMeetingFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    date: z.string().min(1, 'Date is required'),
    time: z.string(),
    duration: z.string(),
    location: z.string(),
    notes: z.string(),
    attendeeEmails: z.array(z.string()),
  })
  .superRefine((val, ctx) => {
    if (!val.attendeeEmails.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select at least one team member to invite',
        path: ['attendeeEmails'],
      })
    }
    const [hourStr, minuteStr] = val.time.split(':')
    const startHour = Number(hourStr)
    if (!Number.isFinite(startHour)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid start time',
        path: ['time'],
      })
    }
    const durationMinutes = Number(val.duration)
    if (val.duration.trim() !== '' && (!Number.isFinite(durationMinutes) || durationMinutes <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duration must be a positive number of minutes',
        path: ['duration'],
      })
    }
  })

export function parseScheduleMeetingForm(
  input: ScheduleMeetingFormInput,
): { ok: true; data: ScheduleMeetingFormParsed } | { ok: false; error: string } {
  const result = scheduleMeetingFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the meeting form') }
  }
  const d = result.data
  const [hourStr, minuteStr] = d.time.split(':')
  return {
    ok: true,
    data: {
      title: d.title,
      date: d.date,
      startHour: Number(hourStr),
      startMinute: Number(minuteStr) || 0,
      durationMinutes: Number(d.duration) || 30,
      location: d.location,
      description: d.notes.trim(),
      attendeeEmails: d.attendeeEmails,
    },
  }
}
