'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { getProduct } from '@/data/seed'

export default function CartPage() {
  const { lines, subtotalFils, deliveryFils, totalFils, formatAed, updateQty, removeItem } = useCart()

  if (lines.length === 0) {
    return (
      <div className="container-site py-16 text-center">
        <h1 className="font-display text-3xl font-black uppercase">Your bag is empty</h1>
        <p className="mt-4 text-ink/60">Time to find something good.</p>
        <Link href="/shop" className="btn-primary mt-8 inline-flex">Shop all</Link>
      </div>
    )
  }

  return (
    <div className="container-site py-8">
      <h1 className="font-display text-3xl font-black uppercase mb-8">Cart</h1>
      <div className="grid gap-8 lg:grid-cols-3">
        <ul className="lg:col-span-2 space-y-4">
          {lines.map((line) => {
            const product = getProduct(line.productId)
            if (!product) return null
            const variant = product.variants.find((v) => v.id === line.variantId)
            const image = product.images[0]
            return (
              <li key={line.variantId} className="flex gap-4 rounded-2xl border-2 border-ink p-4">
                <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-ink">
                  {image && <Image src={image.url} alt="" fill className="object-cover" unoptimized />}
                </div>
                <div className="flex-1">
                  <Link href={`/product/${product.slug}`} className="font-semibold hover:text-teal">{product.name}</Link>
                  <p className="text-sm text-ink/60">{variant?.size} · {variant?.color}</p>
                  <p className="font-bold mt-1">{formatAed(product.priceFils)}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <button type="button" onClick={() => updateQty(line.variantId, line.qty - 1)} className="rounded-full border border-ink p-1"><Minus className="h-4 w-4" /></button>
                    <span className="font-semibold">{line.qty}</span>
                    <button type="button" onClick={() => updateQty(line.variantId, line.qty + 1)} className="rounded-full border border-ink p-1"><Plus className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeItem(line.variantId)} className="ml-auto text-ink/50 hover:text-ink"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="rounded-2xl border-2 border-ink p-6 h-fit">
          <h2 className="font-display text-lg font-black uppercase mb-4">Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatAed(subtotalFils)}</span></div>
            <div className="flex justify-between"><span>Delivery</span><span>{deliveryFils === 0 ? 'Free' : formatAed(deliveryFils)}</span></div>
            <div className="flex justify-between font-bold text-base border-t-2 border-ink pt-2 mt-2">
              <span>Total</span><span>{formatAed(totalFils)}</span>
            </div>
          </div>
          <Link href="/checkout" className="btn-primary w-full mt-6">Checkout</Link>
        </div>
      </div>
    </div>
  )
}
