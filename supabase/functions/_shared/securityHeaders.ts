/** M13: safe response headers for Edge JSON/CORS responses. */

export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
  }
}

export function withSecurityHeaders(
  base: Record<string, string>,
): Record<string, string> {
  return { ...securityHeaders(), ...base }
}
