'use client'

import { useMemo, useState } from 'react'
import { getAllProducts, collections } from '@/data/seed'
import { ProductCard } from '@/components/ProductCard'
import type { CollectionSlug, ProductType, Size } from '@/lib/types'
import { SIZES } from '@/lib/types'

const allProducts = getAllProducts()
const types = [...new Set(allProducts.map((p) => p.type))]
const colors = [...new Set(allProducts.flatMap((p) => p.variants.map((v) => v.color)))]

export default function ShopPage() {
  const [collection, setCollection] = useState<CollectionSlug | ''>('')
  const [type, setType] = useState<ProductType | ''>('')
  const [size, setSize] = useState<Size | ''>('')
  const [color, setColor] = useState('')
  const [maxPrice, setMaxPrice] = useState(250)
  const [sort, setSort] = useState<'featured' | 'price-asc' | 'price-desc' | 'name'>('featured')

  const filtered = useMemo(() => {
    let list = [...allProducts]
    if (collection) list = list.filter((p) => p.collection === collection)
    if (type) list = list.filter((p) => p.type === type)
    if (size) list = list.filter((p) => p.variants.some((v) => v.size === size && v.stock > 0))
    if (color) list = list.filter((p) => p.variants.some((v) => v.color === color))
    list = list.filter((p) => p.priceFils <= maxPrice * 100)

    switch (sort) {
      case 'price-asc':
        list.sort((a, b) => a.priceFils - b.priceFils)
        break
      case 'price-desc':
        list.sort((a, b) => b.priceFils - a.priceFils)
        break
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      default:
        list.sort((a, b) => (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0))
    }
    return list
  }, [collection, type, size, color, maxPrice, sort])

  return (
    <div className="container-site py-8">
      <h1 className="font-display text-4xl font-black uppercase mb-8">Shop</h1>

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="lg:w-56 shrink-0 space-y-6">
          <FilterSelect label="Collection" value={collection} onChange={setCollection} options={[
            { value: '', label: 'All' },
            ...collections.map((c) => ({ value: c.slug, label: c.name })),
          ]} />
          <FilterSelect label="Type" value={type} onChange={setType} options={[
            { value: '', label: 'All' },
            ...types.map((t) => ({ value: t, label: t.replace(/-/g, ' ') })),
          ]} />
          <FilterSelect label="Size" value={size} onChange={setSize} options={[
            { value: '', label: 'All' },
            ...SIZES.map((s) => ({ value: s, label: s })),
          ]} />
          <FilterSelect label="Color" value={color} onChange={setColor} options={[
            { value: '', label: 'All' },
            ...colors.map((c) => ({ value: c, label: c })),
          ]} />
          <div>
            <label className="text-sm font-bold">Max price (AED)</label>
            <input
              type="range"
              min={30}
              max={250}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <span className="text-sm text-ink/60">AED {maxPrice}</span>
          </div>
        </aside>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-ink/60">{filtered.length} products</p>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold bg-cream"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: Low to high</option>
              <option value="price-desc">Price: High to low</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="py-12 text-center text-ink/60">No products match your filters.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div>
      <label className="text-sm font-bold">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 w-full rounded-lg border-2 border-ink px-3 py-2 text-sm bg-cream"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
