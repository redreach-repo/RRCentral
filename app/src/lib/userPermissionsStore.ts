import { db } from './db'
import { USER_PERMISSION_KEYS, type UserPermissionKey } from './userPermissions'

/** Switches of one person. Missing table (lockdown SQL not run yet) reads as none. */
export async function listUserPermissions(userId: string): Promise<{ keys: UserPermissionKey[]; missingTable: boolean }> {
  const { data, error } = await db.from('user_permissions').select('permission').eq('user_id', userId)
  if (error) {
    const missing = /user_permissions|does not exist|schema cache/i.test(error.message || '')
    if (missing) return { keys: [], missingTable: true }
    throw new Error(error.message)
  }
  const keys = ((data || []) as { permission: string }[])
    .map((r) => r.permission)
    .filter((k): k is UserPermissionKey => (USER_PERMISSION_KEYS as readonly string[]).includes(k))
  return { keys, missingTable: false }
}

/** Switch on or off. Only admins can (the database refuses everyone else). */
export async function setUserPermission(userId: string, key: UserPermissionKey, on: boolean): Promise<void> {
  if (on) {
    const { error } = await db.from('user_permissions').insert({ user_id: userId, permission: key })
    if (error && !/duplicate|unique/i.test(error.message || '')) throw new Error(error.message)
    return
  }
  const { error } = await db.from('user_permissions').delete().eq('user_id', userId).eq('permission', key)
  if (error) throw new Error(error.message)
}
