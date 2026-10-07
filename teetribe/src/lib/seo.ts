import type { Metadata } from 'next'
import type { Product } from '@/lib/types'
import { formatAed } from '@/lib/money'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export function siteMetadata(overrides?: Partial<Metadata>): Metadata {
  return {
    title: overrides?.title ?? 'Tee Tribe — Premium Tees & Tribe Gear',
    description:
      overrides?.description ??
      'Mobile-first UAE storefront for premium tees, limited drops, and custom tribe-made merch.',
    openGraph: {
      type: 'website',
      locale: 'en_AE',
      url: siteUrl,
      siteName: 'Tee Tribe',
      ...overrides?.openGraph,
    },
    twitter: {
      card: 'summary_large_image',
      ...overrides?.twitter,
    },
    ...overrides,
  }
}

export function productMetadata(product: Product): Metadata {
  const image = product.images[0]?.url
  const absoluteImage = image?.startsWith('http') ? image : `${siteUrl}${image}`

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      type: 'website',
      images: absoluteImage ? [{ url: absoluteImage, alt: product.name }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description: product.description,
      images: absoluteImage ? [absoluteImage] : [],
    },
  }
}

export function productJsonLd(product: Product) {
  const image = product.images[0]?.url
  const absoluteImage = image?.startsWith('http') ? image : `${siteUrl}${image}`

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: absoluteImage,
    sku: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: 'Tee Tribe' },
    offers: {
      '@type': 'Offer',
      url: `${siteUrl}/product/${product.slug}`,
      priceCurrency: 'AED',
      price: (product.priceFils / 100).toFixed(2),
      availability:
        product.variants.some((v) => v.stock > 0)
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  }
}

export function formatProductPriceForSchema(fils: number): string {
  return formatAed(fils).replace('AED ', '')
}
