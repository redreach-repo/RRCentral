import { z } from 'zod'
import { MIN_PASSWORD_LENGTH } from '../authApi'
import { firstZodError, passwordMinMessage } from './common'

export type ChangePasswordInput = {
  newPassword: string
  confirmPassword: string
}

export const changePasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, passwordMinMessage()),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function parseChangePassword(
  input: ChangePasswordInput,
): { ok: true; data: { newPassword: string } } | { ok: false; error: string } {
  const result = changePasswordSchema.safeParse(input)
  if (result.success) return { ok: true, data: { newPassword: result.data.newPassword } }
  return { ok: false, error: firstZodError(result.error, 'Check your new password') }
}
