import { db } from './db'
import { enqueueDomainEvent } from './eventOutbox'

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

  // Mirror into M1 event_outbox for future cross-module workers (best-effort).
  void enqueueDomainEvent({
    eventType: action,
    aggregateType: entity,
    aggregateId: reference,
    payload: {
      details: details || '',
      user_email: userEmail || '',
      ...(crmId ? { crm_id: crmId } : {}),
    },
  })
}
