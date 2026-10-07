import Link from 'next/link'
import { Logo } from './Logo'

const footerLinks = [
  { href: '/faq', label: 'FAQ' },
  { href: '/size-guide', label: 'Size Guide' },
  { href: '/shipping', label: 'Shipping' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

export function Footer() {
  return (
    <footer className="border-t-2 border-ink bg-ink text-cream mt-16">
      <div className="container-site py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <Logo className="[&_span]:text-cream [&_span]:group-hover:text-sunshine" />
            <p className="mt-4 max-w-xs text-sm text-cream/70">
              Premium tees and tribe gear for the UAE. Designed with love, shipped fast.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm hover:text-sunshine transition-colors">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-10 border-t border-cream/20 pt-6 text-center text-xs text-cream/50">
          © {new Date().getFullYear()} Tee Tribe. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
