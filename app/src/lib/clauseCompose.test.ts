import { describe, expect, it } from 'vitest'
import { clauseKeysFromText, clauseMarker, formatClauseForTemplate, insertTextAtCursor } from './clauseCompose'

describe('clauseCompose', () => {
  it('formats a clause as a markdown section with a spawn marker', () => {
    const block = formatClauseForTemplate({
      clause_key: 'recipient_obligations',
      title: 'Recipient obligations',
      body: 'Use Confidential Information only for the stated purpose.',
    })
    expect(block).toContain(clauseMarker('recipient_obligations'))
    expect(block).toContain('## Recipient obligations')
    expect(block).toContain('Use Confidential Information only for the stated purpose.')
  })

  it('extracts unique clause keys from template text', () => {
    const text = `
${clauseMarker('confidentiality_def')}
## Def
${clauseMarker('recipient_obligations')}
## Duties
${clauseMarker('confidentiality_def')}
`
    expect(clauseKeysFromText(text)).toEqual(['confidentiality_def', 'recipient_obligations'])
  })

  it('inserts text at the cursor', () => {
    const { text, cursor } = insertTextAtCursor('Hello world', ' dear', 5, 5)
    expect(text).toBe('Hello dear world')
    expect(cursor).toBe(10)
  })
})
