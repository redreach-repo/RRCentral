import { db } from './db'

export async function logActivity(
  action: string,
  entity: string,
  reference: string,
  details: string,
  userEmail: string,
): Promise<void> {
  const { error } = await db.from('activity_log').insert({
    action,
    entity,
    reference: reference || '',
    details: details || '',
    user_email: userEmail || '',
  })

  if (error) {
    console.error('Failed to log activity:', error.message)
  }
}
