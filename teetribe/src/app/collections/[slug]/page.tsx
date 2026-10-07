import { notFound } from 'next/navigation'
import { getCollection, getProductsByCollection } from '@/data/seed'
import { ProductCard } from '@/components/ProductCard'
import type { CollectionSlug } from '@/lib/types'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const collection = getCollection(slug as CollectionSlug)
  if (!collection) return { title: 'Collection' }
  return { title: collection.name, description: collection.description }
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params
  const collection = getCollection(slug as CollectionSlug)
  if (!collection) notFound()

  const products = getProductsByCollection(collection.slug)

  return (
    <div className="container-site py-8">
      <div className="mb-8 rounded-2xl border-2 border-ink p-8" style={{ backgroundColor: collection.heroTone }}>
        <h1 className="font-display text-4xl font-black uppercase text-ink sm:text-5xl">{collection.name}</h1>
        <p className="mt-3 max-w-xl text-ink/80">{collection.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {products.length === 0 && (
        <p className="py-12 text-center text-ink/60">No products in this collection yet.</p>
      )}
    </div>
  )
}
