/** Start of the plain message shown when a table or column is not on the database yet. */
export const SETUP_NEEDED_PREFIX = "This part of the CRM needs a database update that isn't on live yet."

/** Plain words for a missing table or column, keeping the technical detail at the end. */
export function setupNeededMessage(detail: string): string {
  if (detail.startsWith(SETUP_NEEDED_PREFIX)) return detail
  return `${SETUP_NEEDED_PREFIX} An admin can see which one under Admin, System check.${detail ? ` (Details: ${detail})` : ''}`
}

/**
 * Message for the screen. A missing table or column (database update not run
 * yet) becomes the plain setup message instead of the raw database text.
 */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const raw = rawErrorMessage(err, fallback)
  if (err && raw !== fallback && (isMissingRelationError(err) || isUndefinedColumnError(err))) {
    return setupNeededMessage(raw)
  }
  return raw
}

/** Unwrap Error, PostgREST `{ message }`, and similar thrown objects, word for word. */
export function rawErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
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
  return new Error(rawErrorMessage(err, fallback))
}

export function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: unknown }).code || '')
  }
  return ''
}

export function isMissingRelationError(err: unknown): boolean {
  const code = errorCode(err)
  const msg = rawErrorMessage(err).toLowerCase()
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.startsWith(SETUP_NEEDED_PREFIX.toLowerCase()) ||
    /could not find the table/.test(msg) ||
    /relation ".+" does not exist/.test(msg) ||
    /schema cache/.test(msg)
  )
}

export function isCheckConstraintError(err: unknown): boolean {
  const code = errorCode(err)
  const msg = rawErrorMessage(err).toLowerCase()
  return code === '23514' || /violates check constraint/.test(msg)
}

export function isUnsupportedDocTypeError(err: unknown): boolean {
  const msg = rawErrorMessage(err).toLowerCase()
  return /invalid input value for enum/.test(msg) || (/doc_type/.test(msg) && /check/.test(msg))
}

export function isUndefinedColumnError(err: unknown): boolean {
  const code = errorCode(err)
  const msg = rawErrorMessage(err).toLowerCase()
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    (/schema cache/.test(msg) && /column/.test(msg)) ||
    /could not find the .*column/.test(msg)
  )
}

export function shouldFallbackDeliveryNoteStorage(err: unknown): boolean {
  return isMissingRelationError(err) || isCheckConstraintError(err) || isUnsupportedDocTypeError(err)
}
