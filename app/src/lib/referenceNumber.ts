/**
 * Finalized reference format: `{prefix}-{divisionCode}-{YY}{seq3}`
 * e.g. RR-01-26004
 * Also recognizes revision suffixes: RR-01-26004_revision 1
 */
export function generateReference(
  divisionCode: string,
  existingRefs: string[],
  prefix = 'RR',
): string {
  const code = String(divisionCode || '01').padStart(2, '0')
  const yy = String(new Date().getFullYear()).slice(-2)
  const pref = prefix || 'RR'
  const pattern = new RegExp(
    `^${escapeRegExp(pref)}-${escapeRegExp(code)}-${yy}(\\d{3})`,
  )

  let max = 0
  for (const ref of existingRefs) {
    const m = String(ref || '').match(pattern)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }

  return `${pref}-${code}-${yy}${String(max + 1).padStart(3, '0')}`
}

export function parseBaseReference(reference: string): string {
  const ref = String(reference || '').trim()
  if (!ref) return ''
  const m = ref.match(/^(.*)_revision\s+\d+$/i)
  return m ? m[1] : ref
}

export function formatRevisionReference(baseReference: string, revision: number): string {
  const rev = Number(revision || 0)
  if (!rev) return baseReference
  return `${baseReference}_revision ${rev}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
