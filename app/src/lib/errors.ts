/** Unwrap Error, PostgREST `{ message }`, and similar thrown objects. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; details?: unknown; hint?: unknown }
    const parts = [o.message, o.details, o.hint].filter(
      (v): v is string => typeof v === 'string' && Boolean(v.trim()),
    )
    if (parts.length) return parts.join(' — ')
  }
  return fallback
}

export function asError(err: unknown, fallback?: string): Error {
  if (err instanceof Error) return err
  return new Error(errorMessage(err, fallback))
}

function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: unknown }).code || '')
  }
  return ''
}

export function isMissingRelationError(err: unknown): boolean {
  const code = errorCode(err)
  const msg = errorMessage(err).toLowerCase()
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the table/.test(msg) ||
    /relation ".+" does not exist/.test(msg) ||
    /schema cache/.test(msg)
  )
}

export function isCheckConstraintError(err: unknown): boolean {
  const code = errorCode(err)
  const msg = errorMessage(err).toLowerCase()
  return code === '23514' || /violates check constraint/.test(msg)
}

export function isUnsupportedDocTypeError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase()
  return /invalid input value for enum/.test(msg) || (/doc_type/.test(msg) && /check/.test(msg))
}

export function shouldFallbackDeliveryNoteStorage(err: unknown): boolean {
  return isMissingRelationError(err) || isCheckConstraintError(err) || isUnsupportedDocTypeError(err)
}
