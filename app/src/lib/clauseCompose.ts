import type { ContractClause } from './types'

/** Markdown block inserted into NDA / agreement drafts from the clause library. */
export function formatClauseForTemplate(clause: Pick<ContractClause, 'title' | 'body' | 'clause_key'>): string {
  const title = clause.title.trim() || clause.clause_key
  const body = clause.body.trim()
  return `\n\n## ${title}\n\n${body}\n`
}

export function insertTextAtCursor(
  source: string,
  insertion: string,
  selectionStart: number,
  selectionEnd: number = selectionStart,
): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, source.length))
  const end = Math.max(start, Math.min(selectionEnd, source.length))
  const text = source.slice(0, start) + insertion + source.slice(end)
  return { text, cursor: start + insertion.length }
}
