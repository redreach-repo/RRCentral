# Security headers (M13)

Static hosting serves `app/public/_headers` (GitHub Pages / compatible hosts):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Edge JSON responses can merge the same via `supabase/functions/_shared/securityHeaders.ts` (wired on `public-api`).

CSP continues via the Vite HTML meta tag. HSTS is host/CDN responsibility when a custom HTTPS domain is used.
