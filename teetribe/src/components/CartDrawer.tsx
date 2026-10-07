'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Minus, Plus, ShoppingBag, X } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { getProduct } from '@/data/seed'
import { cn } from '@/lib/cn'

type CartDrawerProps = {
  open: boolean
  onClose: () => void
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { lines, itemCount, subtotalFils, formatAed, updateQty, removeItem } = useCart()

  return (
    <>
      <div
        className={cn('fixed inset-0 z-50 bg-ink/40 transition-opacity', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l-2 border-ink bg-cream transition-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between border-b-2 border-ink p-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            <h2 className="font-display text-lg font-black uppercase">Bag ({itemCount})</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <p className="py-12 text-center text-ink/60">Your bag is empty.</p>
          ) : (
            <ul className="space-y-4">
              {lines.map((line) => {
                const product = getProduct(line.productId)
                if (!product) return null
                const variant = product.variants.find((v) => v.id === line.variantId)
                const image = product.images[0]
                return (
                  <li key={line.variantId} className="flex gap-3">
                    <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-ink">
                      {image && <Image src={image.url} alt="" fill className="object-cover" unoptimized />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{product.name}</p>
                      <p className="text-xs text-ink/60">{variant?.size} · {variant?.color}</p>
                      <p className="text-sm font-bold mt-1">{formatAed(product.priceFils)}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={() => updateQty(line.variantId, line.qty - 1)} className="rounded-full border border-ink p-1">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-semibold w-6 text-center">{line.qty}</span>
                        <button type="button" onClick={() => updateQty(line.variantId, line.qty + 1)} className="rounded-full border border-ink p-1">
                          <Plus className="h-3 w-3" />
                        </button>
                        <button type="button" onClick={() => removeItem(line.variantId)} className="ml-auto text-xs text-ink/50 hover:text-ink">
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t-2 border-ink p-4 space-y-3">
            <div className="flex justify-between font-semibold">
              <span>Subtotal</span>
              <span>{formatAed(subtotalFils)}</span>
            </div>
            <Link href="/checkout" onClick={onClose} className="btn-primary w-full">
              Checkout
            </Link>
            <Link href="/cart" onClick={onClose} className="btn-secondary w-full text-center">
              View cart
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
