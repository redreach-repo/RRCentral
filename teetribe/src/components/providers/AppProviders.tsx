'use client'

import { CartProvider } from '@/context/CartContext'
import { LocaleProvider } from '@/context/LocaleContext'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <CartProvider>{children}</CartProvider>
    </LocaleProvider>
  )
}
