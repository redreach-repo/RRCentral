/**
 * M1 Zod starter: login credentials validation shared by LoginPage (and tests).
 * Domain rule stays in allowedLoginEmail — schema composes it.
 */
import { z } from 'zod'
import { isAllowedLoginEmail, loginEmailDomainError, normalizeEmail } from '../allowedLoginEmail'
import { MIN_PASSWORD_LENGTH } from '../authApi'

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
      email: z
        .string()
        .trim()
        .min(1, 'Enter your email')
        .email('Enter a valid email')
        .transform((v) => normalizeEmail(v))
        .refine((v) => isAllowedLoginEmail(v), {
          message: loginEmailDomainError(),
        }),
      password: z.string(),
    })
    .superRefine((val, ctx) => {
      // Local mode historically skips min-length (HTML required={!isLocalMode}).
      if (localMode) return
      if (!val.password || val.password.length < MIN_PASSWORD_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
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
  const first = result.error.issues[0]
  return { ok: false, error: first?.message || 'Check your email and password' }
}
