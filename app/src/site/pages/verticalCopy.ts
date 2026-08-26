import type { VerticalPlaybook } from '../data/playbooks'
import type { Vertical } from '../data/verticals'

export function ctaLabel(layout: VerticalPlaybook['layout']) {
  if (layout === 'medical') return 'Request an assessment'
  if (layout === 'travel') return 'Plan this journey'
  if (layout === 'apparel') return 'Request samples'
  if (layout === 'va') return 'Get a VA'
  if (layout === 'learn') return 'Ask about a course'
  if (layout === 'trade') return 'Send a spec'
  return 'Start a project'
}

export function briefTitle(layout: VerticalPlaybook['layout']) {
  if (layout === 'medical') return 'Tell us the'
  if (layout === 'travel') return 'Tell us how you'
  if (layout === 'apparel') return 'Tell us the'
  if (layout === 'va') return 'Tell us the'
  if (layout === 'learn') return 'Tell us what to'
  if (layout === 'trade') return 'Send the'
  return 'Ready when'
}

export function briefAccent(layout: VerticalPlaybook['layout']) {
  if (layout === 'medical') return 'condition.'
  if (layout === 'travel') return 'want to move.'
  if (layout === 'apparel') return 'programme.'
  if (layout === 'va') return 'seat to fill.'
  if (layout === 'learn') return 'build next.'
  if (layout === 'trade') return 'spec.'
  return 'you are.'
}

export function whatsappHref(vertical: Vertical) {
  const text = encodeURIComponent(`Hello Red Reach — I am enquiring about ${vertical.brand}.`)
  return `https://wa.me/971507008977?text=${text}`
}

export const THREADS_CATALOGUE = `${import.meta.env.BASE_URL}catalogues/RR_Threads_Premium_Catalogue.pdf`
