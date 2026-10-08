const LIVE_ORIGIN = 'https://tee-tribe.com'

/** Canonical origin for SEO, Stripe return URLs, and sitemaps. */
export function publicSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (explicit) return explicit
  if (process.env.VERCEL_ENV === 'production') return LIVE_ORIGIN
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export const TEE_TRIBE_ORIGIN = LIVE_ORIGIN
