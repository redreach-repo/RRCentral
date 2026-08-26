import { publicUrl } from './seo'
import { SITE, VERTICALS } from './verticals'
import { verticalPath } from './playbooks'

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.legal,
    alternateName: SITE.name,
    url: publicUrl('/'),
    email: SITE.email,
    telephone: SITE.phone,
    foundingDate: String(SITE.founded),
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'P.O. Box 6641',
      addressLocality: 'Dubai',
      addressCountry: 'AE',
    },
    department: VERTICALS.map((v) => ({
      '@type': 'Organization',
      name: v.brand,
      url: publicUrl(verticalPath(v.slug)),
      description: v.summary,
    })),
  }
}

export function webPageJsonLd(name: string, path: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: publicUrl(path),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE.name,
      url: publicUrl('/'),
    },
  }
}
