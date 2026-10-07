'use client'

import Link from 'next/link'
import { Menu, ShoppingBag, X } from 'lucide-react'
import { useState } from 'react'
import { Logo } from './Logo'
import { CartDrawer } from './CartDrawer'
import { useCart } from '@/context/CartContext'
import { useLocale } from '@/context/LocaleContext'
import { cn } from '@/lib/cn'

const navLinks = [
  { href: '/shop', key: 'shop' as const },
  { href: '/drops', key: 'drops' as const },
  { href: '/tribe-made', key: 'tribeMade' as const },
  { href: '/family', key: 'family' as const },
  { href: '/about', key: 'about' as const },
]

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const { itemCount } = useCart()
  const { locale, setLocale, t } = useLocale()

  return (
    <>
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-cream/95 backdrop-blur">
        <div className="container-site flex h-16 items-center justify-between">
          <Logo size="sm" />

          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm font-semibold hover:text-teal transition-colors">
                {t(link.key)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
              className="rounded-full border-2 border-ink px-3 py-1 text-xs font-bold uppercase"
            >
              {locale === 'en' ? 'AR' : 'EN'}
            </button>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative rounded-full p-2 hover:bg-ink/5"
              aria-label="Open cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-[10px] font-bold text-ink">
                  {itemCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-full p-2 hover:bg-ink/5 md:hidden"
              aria-label="Menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className={cn('border-t-2 border-ink md:hidden', menuOpen ? 'block' : 'hidden')}>
          <nav className="container-site flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-ink/5"
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  )
}
