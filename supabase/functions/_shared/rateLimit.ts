/**
 * M13: call Postgres rr_rate_limit_hit via service-role client.
 * Returns true when the request is allowed.
 */
export async function rateLimitAllow(
  // deno-lint-ignore no-explicit-any
  sb: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> },
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<{ allowed: boolean; error?: string }> {
  const { data, error } = await sb.rpc("rr_rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) return { allowed: false, error: error.message || "rate_limit_error" }
  return { allowed: data === true }
}
