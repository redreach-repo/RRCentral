import { SITE } from './verticals'

export function publicUrl(path = '/') {
  const origin = SITE.publicOrigin.replace(/\/$/, '')
  if (!path || path === '/') return `${origin}/`
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

export type SeoInput = {
  title: string
  description: string
  path?: string
  image?: string
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

export const DEFAULT_OG_IMAGE = 'hero-team.jpg'
