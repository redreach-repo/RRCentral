import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'

export type PasskeyStubRow = {
  id: string
  user_email: string
  nickname: string
  created_at: string
}

export async function listPasskeyStubs(userEmail: string): Promise<PasskeyStubRow[]> {
  if (!isSupabaseConfigured() || !userEmail.trim()) return []
  const { data, error } = await db
    .from('mfa_passkey_stubs')
    .select('id, user_email, nickname, created_at')
    .ilike('user_email', userEmail.trim())
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as PasskeyStubRow[]
}

export async function countPasskeyStubs(userEmail: string): Promise<number> {
  return (await listPasskeyStubs(userEmail)).length
}

/** Stub enroll: nickname only — no live WebAuthn credential. */
export async function enrollPasskeyStub(input: {
  userEmail: string
  nickname?: string
}): Promise<void> {
  const email = input.userEmail.trim().toLowerCase()
  if (!email) throw new Error('Sign in required to enroll a passkey stub')
  const { error } = await db.from('mfa_passkey_stubs').insert({
    user_email: email,
    nickname: (input.nickname || 'Passkey').trim() || 'Passkey',
  })
  if (error) throw error
}
