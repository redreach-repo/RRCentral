import { z } from 'zod'
import { MIN_PASSWORD_LENGTH } from '../authApi'
import { USER_ROLES } from '../permissions'
import type { UserRole } from '../types'
import { companyEmailSchema, firstZodError, passwordMinMessage } from './common'

const roleSchema = z.enum(USER_ROLES as [UserRole, ...UserRole[]])

export type AppUserFormInput = {
  email: string
  name: string
  role: UserRole
  active: boolean
  password: string
  /** When editing, password may be blank (leave unchanged). */
  editing?: boolean
  /** Local mode may create users without an auth password. */
  localMode?: boolean
}

export type AppUserFormData = {
  email: string
  name: string
  role: UserRole
  active: boolean
  password: string
}

export function appUserFormSchema(opts: { editing?: boolean; localMode?: boolean } = {}) {
  const editing = Boolean(opts.editing)
  const localMode = Boolean(opts.localMode)
  return z
    .object({
      email: companyEmailSchema,
      name: z.string().trim(),
      role: roleSchema,
      active: z.boolean(),
      password: z.string(),
    })
    .superRefine((val, ctx) => {
      const password = val.password.trim()
      if (!editing && !localMode && !password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: `Set an initial password (min ${MIN_PASSWORD_LENGTH} characters)`,
        })
        return
      }
      if (password && password.length < MIN_PASSWORD_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: passwordMinMessage(),
        })
      }
    })
}

export function parseAppUserForm(
  input: AppUserFormInput,
): { ok: true; data: AppUserFormData } | { ok: false; error: string } {
  const result = appUserFormSchema({
    editing: input.editing,
    localMode: input.localMode,
  }).safeParse({
    email: input.email,
    name: input.name,
    role: input.role,
    active: input.active,
    password: input.password,
  })
  if (result.success) {
    return {
      ok: true,
      data: {
        email: result.data.email,
        name: result.data.name,
        role: result.data.role,
        active: result.data.active,
        password: result.data.password.trim(),
      },
    }
  }
  return { ok: false, error: firstZodError(result.error, 'Check the user form') }
}
