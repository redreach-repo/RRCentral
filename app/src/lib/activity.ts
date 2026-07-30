import { db } from './db'

export async function logActivity(
  action: string,
  entity: string,
  reference: string,
  details: string,
  userEmail: string,
  crmId?: string | null,
): Promise<void> {
  const row: Record<string, unknown> = {
    action,
    entity,
    reference: reference || '',
    details: details || '',
    user_email: userEmail || '',
  }
  if (crmId) row.crm_id = crmId

  const { error } = await db.from('activity_log').insert(row)

  if (error) {
    console.error('Failed to log activity:', error.message)
  }
}
