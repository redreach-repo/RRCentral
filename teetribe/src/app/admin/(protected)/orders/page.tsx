'use client'

import { useEffect, useState } from 'react'
import { mockOrders } from '@/data/seed'

type OrderRow = {
  id: string
  email: string
  name: string
  totalFils: number
  status: string
  createdAt: string
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])

  useEffect(() => {
    fetch('/api/admin/orders')
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || mockOrders.map((o) => ({
        id: o.id,
        email: o.email,
        name: o.email.split('@')[0],
        totalFils: o.totalFils,
        status: o.status,
        createdAt: o.createdAt,
      }))))
      .catch(() => setOrders(mockOrders.map((o) => ({
        id: o.id,
        email: o.email,
        name: o.email.split('@')[0],
        totalFils: o.totalFils,
        status: o.status,
        createdAt: o.createdAt,
      }))))
  }, [])

  return (
    <div>
      <h2 className="font-display text-2xl font-black uppercase mb-4">Orders</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-2 border-ink rounded-2xl overflow-hidden">
          <thead className="bg-ink text-cream">
            <tr>
              <th className="py-3 px-4 text-left">Order</th>
              <th className="py-3 px-4 text-left">Customer</th>
              <th className="py-3 px-4 text-left">Email</th>
              <th className="py-3 px-4 text-left">Total</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-ink/10">
                <td className="py-3 px-4 font-semibold">{o.id}</td>
                <td className="py-3 px-4">{o.name}</td>
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
