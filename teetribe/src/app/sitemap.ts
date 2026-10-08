import type { MetadataRoute } from 'next'
import { collections, products } from '@/data/seed'
import { publicSiteUrl } from '@/lib/site'

const siteUrl = publicSiteUrl()

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    '',
    '/shop',
    '/drops',
    '/tribe-made',
    '/family',
    '/about',
    '/faq',
    '/contact',
    '/shipping',
    '/size-guide',
    '/privacy',
    '/terms',
    '/cart',
    '/checkout',
    '/order/track',
  ]

  const routes: MetadataRoute.Sitemap = staticPages.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.8,
  }))

  for (const c of collections) {
    routes.push({
      url: `${siteUrl}/collections/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  for (const p of products.filter((pr) => pr.isActive)) {
    routes.push({
      url: `${siteUrl}/product/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    })
  }

  return routes
}
