/**
 * M1 Zod: login credentials validation shared by LoginPage (and tests).
 */
import { z } from 'zod'
import { MIN_PASSWORD_LENGTH } from '../authApi'
import { companyEmailSchema, firstZodError, passwordMinMessage } from './common'

export type LoginCredentialsInput = {
  email: string
  password: string
  /** When true, password length is not enforced (local mode). */
  localMode?: boolean
}

export type LoginCredentials = {
  email: string
  password: string
}

export function loginCredentialsSchema(opts: { localMode?: boolean } = {}) {
  const localMode = Boolean(opts.localMode)
  return z
    .object({
      email: companyEmailSchema,
      password: z.string(),
    })
    .superRefine((val, ctx) => {
      if (localMode) return
      if (!val.password || val.password.length < MIN_PASSWORD_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: passwordMinMessage(),
        })
      }
    })
}

/** Parse login form values. Returns credentials or the first human-readable issue. */
export function parseLoginCredentials(
  input: LoginCredentialsInput,
): { ok: true; data: LoginCredentials } | { ok: false; error: string } {
  const result = loginCredentialsSchema({ localMode: input.localMode }).safeParse({
    email: input.email,
    password: input.password,
  })
  if (result.success) {
    return { ok: true, data: { email: result.data.email, password: result.data.password } }
  }
  return { ok: false, error: firstZodError(result.error, 'Check your email and password') }
}
