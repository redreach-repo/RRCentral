/**
 * Structured logs for the browser (gap plan module 3). One JSON shape shared
 * with Edge Functions (supabase/functions/_shared/structuredLog.ts):
 *   { ts, level, msg, source, fn?, request_id?, tenant_id?, duration_ms?, status?, ...fields }
 * Values are scrubbed. Debug lines only print in dev builds.
 */
import { scrubText, scrubValue } from './scrub'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export type LogLine = {
  ts: string
  level: LogLevel
  msg: string
  source: 'app' | 'edge'
  [field: string]: unknown
}

export function formatLogLine(
  level: LogLevel,
  msg: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
  source: 'app' | 'edge' = 'app',
): LogLine {
  const clean = scrubValue(fields) as Record<string, unknown>
  // Reserved keys cannot be overwritten by fields.
  delete clean.ts
  delete clean.level
  delete clean.msg
  delete clean.source
  return { ts: now.toISOString(), level, msg: scrubText(msg).slice(0, 2000), source, ...clean }
}

export function shouldLog(level: LogLevel, min: LogLevel): boolean {
  return ORDER[level] >= ORDER[min]
}

const MIN: LogLevel = import.meta.env?.DEV ? 'debug' : 'info'

export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  if (!shouldLog(level, MIN)) return
  const line = JSON.stringify(formatLogLine(level, msg, fields))
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
