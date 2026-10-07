'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { formatAed } from '@/lib/money'
import { Badge } from './Badge'

type ProductCardProps = {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const image = product.images[0]
  const lowStock = product.variants.reduce((s, v) => s + v.stock, 0) < 10

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border-2 border-ink bg-cream">
        {image && (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 25vw"
            unoptimized
          />
        )}
        <div className="absolute left-3 top-3 flex flex-col gap-2">
          {product.isDrop && <Badge>Limited</Badge>}
          {product.compareAtFils && <Badge variant="teal">Sale</Badge>}
          {lowStock && !product.isDrop && <Badge variant="outline">Low stock</Badge>}
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="font-semibold leading-tight group-hover:text-teal transition-colors">{product.name}</h3>
        <div className="flex items-center gap-2">
          <span className="font-bold">{formatAed(product.priceFils)}</span>
          {product.compareAtFils && (
            <span className="text-sm text-ink/50 line-through">{formatAed(product.compareAtFils)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
