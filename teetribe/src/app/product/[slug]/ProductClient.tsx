'use client'

import Image from 'next/image'
import { useState } from 'react'
import { formatAed } from '@/lib/money'
import { ProductCard } from '@/components/ProductCard'
import { Badge } from '@/components/Badge'
import { SizeGuideDrawer } from '@/components/SizeGuideDrawer'
import { useCart } from '@/context/CartContext'
import { useLocale } from '@/context/LocaleContext'
import { totalStock } from '@/lib/catalog'
import type { Product } from '@/lib/types'

type Props = { product: Product; related: Product[] }

export function ProductClient({ product: p, related }: Props) {
  const { addItem } = useCart()
  const { t } = useLocale()
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [view, setView] = useState<'front' | 'back'>('front')
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)

  const stock = totalStock(p)
  const selectedVariant = p.variants.find((v) => v.id === selectedVariantId)
  const frontImage = p.images.find((i) => i.view === 'front') || p.images[0]
  const backImage = p.images.find((i) => i.view === 'back')
  const displayImage = view === 'back' && backImage ? backImage : frontImage

  const sizes = [...new Set(p.variants.map((v) => v.size))]
  const colors = [...new Set(p.variants.map((v) => v.color))]

  function selectSize(size: string) {
    const color = selectedVariant?.color || colors[0]
    const variant = p.variants.find((v) => v.size === size && v.color === color && v.stock > 0)
    if (variant) setSelectedVariantId(variant.id)
  }

  function selectColor(color: string) {
    const size = selectedVariant?.size || sizes[0]
    const variant = p.variants.find((v) => v.size === size && v.color === color && v.stock > 0)
    if (variant) setSelectedVariantId(variant.id)
  }

  function handleAdd() {
    if (!selectedVariant) return
    addItem(p.id, selectedVariant.id)
  }

  return (
    <div className="container-site py-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border-2 border-ink bg-cream">
            {displayImage && (
              <Image src={displayImage.url} alt={displayImage.alt} fill className="object-cover" unoptimized priority />
            )}
          </div>
          {backImage && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setView('front')} className={`rounded-lg border-2 px-4 py-2 text-sm font-semibold ${view === 'front' ? 'border-ink bg-ink text-cream' : 'border-ink/30'}`}>
                Front
              </button>
              <button type="button" onClick={() => setView('back')} className={`rounded-lg border-2 px-4 py-2 text-sm font-semibold ${view === 'back' ? 'border-ink bg-ink text-cream' : 'border-ink/30'}`}>
                Back
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {p.isDrop && <Badge>Limited drop</Badge>}
            {p.compareAtFils && <Badge variant="teal">On sale</Badge>}
          </div>
          <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">{p.name}</h1>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-2xl font-bold">{formatAed(p.priceFils)}</span>
            {p.compareAtFils && (
              <span className="text-lg text-ink/50 line-through">{formatAed(p.compareAtFils)}</span>
            )}
          </div>
          <p className="mt-4 text-ink/70">{p.description}</p>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Size</span>
              <button type="button" onClick={() => setSizeGuideOpen(true)} className="text-sm text-teal font-semibold hover:underline">
                Size guide
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {sizes.map((s) => {
                const hasStock = p.variants.some((v) => v.size === s && v.stock > 0)
                const active = selectedVariant?.size === s
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!hasStock}
                    onClick={() => selectSize(s)}
                    className={`rounded-lg border-2 px-4 py-2 text-sm font-semibold disabled:opacity-30 ${active ? 'border-ink bg-ink text-cream' : 'border-ink/30'}`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-4">
            <span className="text-sm font-bold">Color</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((c) => {
                const variant = p.variants.find((v) => v.color === c)
                const active = selectedVariant?.color === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => selectColor(c)}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-semibold ${active ? 'border-ink' : 'border-ink/30'}`}
                  >
                    <span className="h-4 w-4 rounded-full border border-ink" style={{ backgroundColor: variant?.colorHex }} />
                    {c}
                  </button>
                )
              })}
            </div>
          </div>

          {stock < 10 && stock > 0 && (
            <p className="mt-4 text-sm font-semibold text-amber">Only {stock} left in stock!</p>
          )}
          {stock === 0 && (
            <p className="mt-4 text-sm font-semibold text-red-600">Out of stock</p>
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedVariant || (selectedVariant?.stock ?? 0) <= 0}
            className="btn-primary mt-6 w-full sm:w-auto"
          >
            {t('addToCart')}
          </button>

          <div className="mt-8 rounded-2xl border-2 border-ink p-4">
            <p className="text-sm font-bold">Delivery</p>
            <p className="mt-1 text-sm text-ink/70">{t('freeDelivery')}</p>
            <p className="mt-1 text-sm text-ink/70">1–3 business days dispatch across UAE.</p>
          </div>

          {p.fabricGsm && (
            <div className="mt-4 rounded-2xl border-2 border-ink p-4">
              <p className="text-sm font-bold">Fabric</p>
              <p className="mt-1 text-sm text-ink/70">{p.fabricGsm}gsm cotton. {p.fitNote}</p>
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl font-black uppercase mb-6">Complete the look</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map((rp) => (
              <ProductCard key={rp.id} product={rp} />
            ))}
          </div>
        </section>
      )}

      <SizeGuideDrawer open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />
    </div>
  )
}
