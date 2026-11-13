import { db } from './db'

export type DomainEventInput = {
  eventType: string
  aggregateType: string
  aggregateId?: string
  payload?: Record<string, unknown>
}

/**
 * Enqueue a durable domain event for later workers (M1 outbox).
 * Best-effort: never throws to callers — failures only log.
 */
export async function enqueueDomainEvent(input: DomainEventInput): Promise<void> {
  const eventType = input.eventType.trim()
  const aggregateType = input.aggregateType.trim()
  if (!eventType || !aggregateType) return

  try {
    const { error } = await db.from('event_outbox').insert({
      event_type: eventType,
      aggregate_type: aggregateType,
      aggregate_id: (input.aggregateId || '').trim(),
      payload: input.payload || {},
      status: 'pending',
    })
    if (error) {
      // Table may be missing in local/IndexedDB mode or older DBs.
      console.error('Failed to enqueue domain event:', error.message)
    }
  } catch (e) {
    console.error('Failed to enqueue domain event:', e)
  }
}
