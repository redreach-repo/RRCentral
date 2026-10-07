'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { CartLine } from '@/lib/types'
import { getProduct } from '@/data/seed'
import { deliveryFeeFils, formatAed } from '@/lib/money'

const STORAGE_KEY = 'teetribe-cart'

type CartContextValue = {
  lines: CartLine[]
  itemCount: number
  subtotalFils: number
  deliveryFils: number
  totalFils: number
  addItem: (productId: string, variantId: string, qty?: number) => void
  removeItem: (variantId: string) => void
  updateQty: (variantId: string, qty: number) => void
  clearCart: () => void
  formatAed: (fils: number) => string
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setLines(JSON.parse(raw))
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  }, [lines, hydrated])

  const addItem = useCallback((productId: string, variantId: string, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variantId)
      if (existing) {
        return prev.map((l) =>
          l.variantId === variantId ? { ...l, qty: l.qty + qty } : l,
        )
      }
      return [...prev, { productId, variantId, qty }]
    })
  }, [])

  const removeItem = useCallback((variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId))
  }, [])

  const updateQty = useCallback((variantId: string, qty: number) => {
    if (qty <= 0) {
      setLines((prev) => prev.filter((l) => l.variantId !== variantId))
      return
    }
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, qty } : l)))
  }, [])

  const clearCart = useCallback(() => setLines([]), [])

  const subtotalFils = useMemo(() => {
    return lines.reduce((sum, line) => {
      const product = getProduct(line.productId)
      return sum + (product?.priceFils ?? 0) * line.qty
    }, 0)
  }, [lines])

  const deliveryFils = deliveryFeeFils(subtotalFils)
  const totalFils = subtotalFils + deliveryFils
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0)

  const value = useMemo(
    () => ({
      lines,
      itemCount,
      subtotalFils,
      deliveryFils,
      totalFils,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      formatAed,
    }),
    [lines, itemCount, subtotalFils, deliveryFils, totalFils, addItem, removeItem, updateQty, clearCart],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
