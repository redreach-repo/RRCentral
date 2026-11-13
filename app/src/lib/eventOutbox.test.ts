import { beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()

vi.mock('./db', () => ({
  db: {
    from: () => ({
      insert: (...args: unknown[]) => insert(...args),
    }),
  },
}))

describe('enqueueDomainEvent', () => {
  beforeEach(() => {
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
  })

  it('skips blank type', async () => {
    const { enqueueDomainEvent } = await import('./eventOutbox')
    await enqueueDomainEvent({ eventType: '  ', aggregateType: 'crm' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('inserts a pending outbox row', async () => {
    const { enqueueDomainEvent } = await import('./eventOutbox')
    await enqueueDomainEvent({
      eventType: 'finalize_quote',
      aggregateType: 'quotation',
      aggregateId: 'Q-1',
      payload: { client: 'Acme' },
    })
    expect(insert).toHaveBeenCalledWith({
      event_type: 'finalize_quote',
      aggregate_type: 'quotation',
      aggregate_id: 'Q-1',
      payload: { client: 'Acme' },
      status: 'pending',
    })
  })

  it('swallows insert errors', async () => {
    insert.mockResolvedValue({ error: { message: 'missing table' } })
    const { enqueueDomainEvent } = await import('./eventOutbox')
    await expect(
      enqueueDomainEvent({ eventType: 'x', aggregateType: 'y' }),
    ).resolves.toBeUndefined()
  })
})
