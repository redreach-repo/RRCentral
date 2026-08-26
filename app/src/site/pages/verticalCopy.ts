import { SITE } from '../data/verticals'
import type { VerticalPlaybook } from '../data/playbooks'
import type { Vertical } from '../data/verticals'

export function ctaLabel(layout: VerticalPlaybook['layout']) {
  if (layout === 'medical') return 'Start your medical journey'
  if (layout === 'travel') return 'Plan your journey'
  if (layout === 'apparel') return 'Request a quote'
  if (layout === 'va') return 'Build your remote team'
  if (layout === 'learn') return 'Explore Sqilah'
  if (layout === 'trade') return 'Send your requirement'
  return 'Book a consultation'
}

export function ctaHref(layout: VerticalPlaybook['layout']) {
  if (layout === 'learn') return SITE.sqilah
  return '#brief'
}

export function ctaIsExternal(layout: VerticalPlaybook['layout']) {
  return layout === 'learn'
}

export function briefTitle(layout: VerticalPlaybook['layout']) {
  if (layout === 'medical') return 'Tell us the'
  if (layout === 'travel') return 'Tell us how you'
  if (layout === 'apparel') return 'Tell us the'
  if (layout === 'va') return 'Tell us the'
  if (layout === 'learn') return 'Questions before you'
  if (layout === 'trade') return 'Send the'
  return 'Ready when'
}

export function briefAccent(layout: VerticalPlaybook['layout']) {
  if (layout === 'medical') return 'condition.'
  if (layout === 'travel') return 'want to move.'
  if (layout === 'apparel') return 'programme.'
  if (layout === 'va') return 'seat to fill.'
  if (layout === 'learn') return 'open Sqilah.'
  if (layout === 'trade') return 'requirement.'
  return 'you are.'
}

export function whatsappHref(vertical: Vertical) {
  const text = encodeURIComponent(`Hello Red Reach. I am enquiring about ${vertical.brand}.`)
  return `https://wa.me/971507008977?text=${text}`
}

export const THREADS_CATALOGUE = `${import.meta.env.BASE_URL}catalogues/RR_Threads_Premium_Catalogue.pdf`
