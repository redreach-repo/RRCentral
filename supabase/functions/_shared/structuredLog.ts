// Structured JSON logs for Edge Functions (gap plan module 3, docs/modules/observability.md).
// Same shape as app/src/lib/observability/log.ts with source "edge". Supabase
// keeps console output in the function logs (Dashboard > Edge Functions > Logs),
// where these lines can be filtered by request_id, fn or level.
import { scrubText, scrubValue } from "./scrub.ts"

export type LogLevel = "debug" | "info" | "warn" | "error"

export function formatEdgeLine(
  level: LogLevel,
  msg: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
): Record<string, unknown> {
  const clean = scrubValue(fields) as Record<string, unknown>
  delete clean.ts
  delete clean.level
  delete clean.msg
  delete clean.source
  return { ts: now.toISOString(), level, msg: scrubText(msg).slice(0, 2000), source: "edge", ...clean }
}

export function logEdge(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify(formatEdgeLine(level, msg, fields))
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

/** Use the caller's x-request-id when it looks sane, else make one. */
export function requestIdFor(req: Request): string {
  const given = req.headers.get("x-request-id") || ""
  return /^[A-Za-z0-9._-]{8,64}$/.test(given) ? given : crypto.randomUUID()
}
