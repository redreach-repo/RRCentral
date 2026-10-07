import Link from 'next/link'
import { mockOrders } from '@/data/seed'
import { isMockMode } from '@/lib/mock'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminOverviewPage() {
  const mockMode = isMockMode()
  let orderCount = mockOrders.length
  let memberCount = 0
  let waitlistCount = 0
  let quoteCount = 0

  if (!mockMode) {
    const admin = createAdminClient()
    if (admin) {
      const [orders, members, waitlist, quotes] = await Promise.all([
        admin.from('orders').select('id', { count: 'exact', head: true }),
        admin.from('members').select('id', { count: 'exact', head: true }),
        admin.from('drop_waitlist').select('id', { count: 'exact', head: true }),
        admin.from('quote_requests').select('id', { count: 'exact', head: true }),
      ])
      orderCount = orders.count ?? 0
      memberCount = members.count ?? 0
      waitlistCount = waitlist.count ?? 0
      quoteCount = quotes.count ?? 0
    }
  }

  const cards = [
    { label: 'Orders', count: orderCount, href: '/admin/orders' },
    { label: 'Members', count: memberCount, href: '/admin/members' },
    { label: 'Waitlist', count: waitlistCount, href: '/admin/waitlist' },
    { label: 'Quotes', count: quoteCount, href: '/admin/quotes' },
  ]

  return (
    <div>
      <h2 className="font-display text-2xl font-black uppercase mb-6">Overview</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border-2 border-ink bg-cream p-6 shadow-sticker hover:bg-sunshine transition-colors"
          >
            <p className="text-3xl font-black">{c.count}</p>
            <p className="mt-1 text-sm font-semibold">{c.label}</p>
          </Link>
        ))}
      </div>
      {mockMode && (
        <div className="mt-8 rounded-2xl border-2 border-ink p-6">
          <h3 className="font-display text-lg font-black uppercase mb-2">Mock orders</h3>
          <p className="text-sm text-ink/70">Showing sample data. Connect Supabase for live orders.</p>
        </div>
      )}
    </div>
  )
}
