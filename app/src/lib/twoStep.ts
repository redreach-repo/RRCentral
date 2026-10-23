import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { UserRole } from './types'

/**
 * Two step sign in: after the password, admins and managers enter a 6 digit
 * code from an authenticator app (Google Authenticator, Microsoft
 * Authenticator, 1Password and so on). Supabase Auth keeps the authenticator
 * (TOTP) and raises the session to "aal2" once the code is checked.
 */

/** Roles that must use two step sign in: the owner (admin) and admins (manager). */
export const TWO_STEP_ROLES: UserRole[] = ['admin', 'manager']

export type AssuranceLevel = { currentLevel: string | null; nextLevel: string | null }

export type TwoStepState = 'not_needed' | 'set_up' | 'enter_code' | 'done'

/**
 * What the signed in person still has to do. `nextLevel` aal2 with
 * `currentLevel` aal1 means an authenticator is set up but this session has
 * not entered a code yet.
 */
export function twoStepState(role: UserRole, level: AssuranceLevel, cloud: boolean): TwoStepState {
  if (!cloud || !TWO_STEP_ROLES.includes(role)) return 'not_needed'
  if (level.currentLevel === 'aal2') return 'done'
  if (level.nextLevel === 'aal2') return 'enter_code'
  return 'set_up'
}

/** Six digits, spaces ignored. */
export function cleanCode(raw: string): string {
  return raw.replace(/\s+/g, '')
}

export function isCodeShaped(raw: string): boolean {
  return /^\d{6}$/.test(cleanCode(raw))
}

export async function getAssuranceLevel(): Promise<AssuranceLevel> {
  if (!isSupabaseConfigured()) return { currentLevel: null, nextLevel: null }
  const { data, error } = await getSupabaseClient().auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel }
}

async function verifiedTotpId(): Promise<string | null> {
  const { data, error } = await getSupabaseClient().auth.mfa.listFactors()
  if (error) throw error
  return data.totp.find((f) => f.status === 'verified')?.id ?? null
}

export type Enrollment = { factorId: string; qrCode: string; secret: string }

/** Start setting up an authenticator. Removes any half finished one first. */
export async function startEnrollment(): Promise<Enrollment> {
  const auth = getSupabaseClient().auth
  const { data: list } = await auth.mfa.listFactors()
  for (const f of list?.all ?? []) {
    if (f.status !== 'verified') await auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: `RR Central ${new Date().toISOString().slice(0, 10)}` })
  if (error) throw error
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

/** Check a code for a factor (finishes set up, or signs this session in fully). */
export async function verifyCode(factorId: string, code: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId, code: cleanCode(code) })
  if (error) throw error
}

export async function verifyExisting(code: string): Promise<void> {
  const id = await verifiedTotpId()
  if (!id) throw new Error('No authenticator is set up yet')
  await verifyCode(id, code)
}

/** Remove the authenticator (for a lost phone, once signed in fully). The next sign in sets up a new one. */
export async function removeAuthenticator(): Promise<void> {
  const id = await verifiedTotpId()
  if (!id) return
  const { error } = await getSupabaseClient().auth.mfa.unenroll({ factorId: id })
  if (error) throw error
}

export type TeamTwoStep = { email: string; role: string; active: boolean; has_two_step: boolean }

/** Admins only: who on the team has two step sign in. */
export async function teamTwoStep(): Promise<TeamTwoStep[]> {
  const { data, error } = await getSupabaseClient().rpc('rr_team_two_step')
  if (error) throw error
  return (data || []) as TeamTwoStep[]
}
