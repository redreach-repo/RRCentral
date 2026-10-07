import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isMockMode } from '@/lib/mock'

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const mockMode = isMockMode()

  if (!mockMode) {
    const supabase = await createClient()
    if (!supabase) {
      redirect('/')
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      redirect('/admin/login')
    }

    if (user.app_metadata?.role !== 'admin') {
      redirect('/')
    }
  }

  const nav = [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/products', label: 'Products' },
    { href: '/admin/orders', label: 'Orders' },
    { href: '/admin/waitlist', label: 'Waitlist' },
    { href: '/admin/quotes', label: 'Quotes' },
    { href: '/admin/members', label: 'Members' },
  ]

  return (
    <div className="min-h-screen bg-cream">
      {mockMode && (
        <div className="border-b-2 border-ink bg-sunshine px-4 py-2 text-center text-sm font-semibold">
          Mock mode — admin access is open. Connect Supabase and set NEXT_PUBLIC_USE_MOCK=false for real auth.
        </div>
      )}
      <div className="container-site py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-48 shrink-0">
            <h1 className="font-display text-2xl font-black uppercase mb-4">Admin</h1>
            <nav className="flex flex-wrap gap-2 lg:flex-col">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg border-2 border-ink px-3 py-2 text-sm font-semibold hover:bg-ink hover:text-cream transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </div>
  )
}
