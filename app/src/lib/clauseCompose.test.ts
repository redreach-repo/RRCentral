import { describe, expect, it } from 'vitest'
import { formatClauseForTemplate, insertTextAtCursor } from './clauseCompose'

describe('clauseCompose', () => {
  it('formats a clause as a markdown section', () => {
    const block = formatClauseForTemplate({
      clause_key: 'recipient_obligations',
      title: 'Recipient obligations',
      body: 'Use Confidential Information only for the stated purpose.',
    })
    expect(block).toContain('## Recipient obligations')
    expect(block).toContain('Use Confidential Information only for the stated purpose.')
  })

  it('inserts text at the cursor', () => {
    const { text, cursor } = insertTextAtCursor('Hello world', ' dear', 5, 5)
    expect(text).toBe('Hello dear world')
    expect(cursor).toBe(10)
  })
})
