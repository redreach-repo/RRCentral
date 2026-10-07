import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getProduct, relatedProducts } from '@/lib/catalog'
import { productMetadata, productJsonLd } from '@/lib/seo'
import { ProductClient } from './ProductClient'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return { title: 'Product not found' }
  return productMetadata(product)
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) notFound()

  const related = await relatedProducts(product)
  const jsonLd = productJsonLd(product)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductClient product={product} related={related} />
    </>
  )
}
