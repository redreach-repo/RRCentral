import type { ContractClause } from './types'

/** Hidden marker stamped into NDA / agreement drafts so sign-time spawn can detect inserted clauses. */
export function clauseMarker(clauseKey: string): string {
  const key = clauseKey.trim().toLowerCase()
  return `<!-- rr-clause:${key} -->`
}

/** Markdown block inserted into NDA / agreement drafts from the clause library. */
export function formatClauseForTemplate(clause: Pick<ContractClause, 'title' | 'body' | 'clause_key'>): string {
  const title = clause.title.trim() || clause.clause_key
  const body = clause.body.trim()
  const key = clause.clause_key.trim().toLowerCase()
  return `\n\n${clauseMarker(key)}\n## ${title}\n\n${body}\n`
}

/** Unique clause keys found in template markdown (compose markers). */
export function clauseKeysFromText(text: string): string[] {
  const found = new Set<string>()
  const re = /<!--\s*rr-clause:([a-z][a-z0-9_]{1,62})\s*-->/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text || '')) !== null) {
    found.add(m[1].toLowerCase())
  }
  return [...found]
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
