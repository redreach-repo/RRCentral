import { mockOrders } from '@/data/seed'

export default function AdminPage() {
  return (
    <div className="container-site py-8">
      <h1 className="font-display text-3xl font-black uppercase mb-4">Admin</h1>
      <div className="rounded-2xl border-2 border-ink bg-sunshine p-6 shadow-sticker mb-8">
        <p className="font-semibold">Connect Supabase to manage products, orders, and inventory.</p>
        <p className="mt-2 text-sm text-ink/70">Set NEXT_PUBLIC_SUPABASE_URL and keys in .env.local, then run migrations.</p>
      </div>

      <h2 className="font-display text-xl font-black uppercase mb-4">Mock orders</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-2 border-ink rounded-2xl overflow-hidden">
          <thead className="bg-ink text-cream">
            <tr>
              <th className="py-3 px-4 text-left">Order</th>
              <th className="py-3 px-4 text-left">Email</th>
              <th className="py-3 px-4 text-left">Total</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {mockOrders.map((o) => (
              <tr key={o.id} className="border-t border-ink/10">
                <td className="py-3 px-4 font-semibold">{o.id}</td>
                <td className="py-3 px-4">{o.email}</td>
                <td className="py-3 px-4">AED {(o.totalFils / 100).toFixed(0)}</td>
                <td className="py-3 px-4 capitalize">{o.status}</td>
                <td className="py-3 px-4">{o.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
