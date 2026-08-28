import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { addLine, itemCount, parseCart, removeLine, serializeCart, setLineQty, type CartLine } from './cart'

const CART_KEY = 'teetribe_cart_v1'
const WISH_KEY = 'teetribe_wish_v1'

type ShopContextValue = {
  lines: CartLine[]
  wishlist: string[]
  drawerOpen: boolean
  count: number
  addToBag: (line: CartLine) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clearCart: () => void
  toggleWish: (productId: string) => void
  hasWish: (productId: string) => boolean
  openCart: () => void
  closeCart: () => void
}

const ShopContext = createContext<ShopContextValue | null>(null)

function readWish(): string[] {
  try {
    const raw = localStorage.getItem(WISH_KEY)
    const data = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(data) ? data.map(String) : []
  } catch {
    return []
  }
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      return parseCart(localStorage.getItem(CART_KEY))
    } catch {
      return []
    }
  })
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      return readWish()
    } catch {
      return []
    }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(CART_KEY, serializeCart(lines))
  }, [lines])

  useEffect(() => {
    localStorage.setItem(WISH_KEY, JSON.stringify(wishlist))
  }, [wishlist])

  const addToBag = useCallback((line: CartLine) => {
    setLines((current) => addLine(current, line))
    setDrawerOpen(true)
  }, [])

  const setQty = useCallback((key: string, qty: number) => {
    setLines((current) => setLineQty(current, key, qty))
  }, [])

  const remove = useCallback((key: string) => {
    setLines((current) => removeLine(current, key))
  }, [])

  const clearCart = useCallback(() => setLines([]), [])

  const toggleWish = useCallback((productId: string) => {
    setWishlist((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    )
  }, [])

  const value = useMemo<ShopContextValue>(
    () => ({
      lines,
      wishlist,
      drawerOpen,
      count: itemCount(lines),
      addToBag,
      setQty,
      remove,
      clearCart,
      toggleWish,
      hasWish: (productId: string) => wishlist.includes(productId),
      openCart: () => setDrawerOpen(true),
      closeCart: () => setDrawerOpen(false),
    }),
    [lines, wishlist, drawerOpen, addToBag, setQty, remove, clearCart, toggleWish],
  )

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used inside ShopProvider')
  return ctx
}
