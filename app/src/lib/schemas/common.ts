/** Shared Zod pieces for M1 form validation. */
import { z } from 'zod'
import { isAllowedLoginEmail, loginEmailDomainError, normalizeEmail } from '../allowedLoginEmail'
import { MIN_PASSWORD_LENGTH } from '../authApi'

export const companyEmailSchema = z
  .string()
  .trim()
  .min(1, 'Enter an email')
  .email('Enter a valid email')
  .transform((v) => normalizeEmail(v))
  .refine((v) => isAllowedLoginEmail(v), {
    message: loginEmailDomainError(),
  })

export function passwordMinMessage(min = MIN_PASSWORD_LENGTH): string {
  return `Password must be at least ${min} characters`
}

export function firstZodError(error: z.ZodError, fallback = 'Check the form'): string {
  return error.issues[0]?.message || fallback
}
