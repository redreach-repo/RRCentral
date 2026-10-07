'use client'

import { useEffect, useState } from 'react'

type QuoteRow = {
  id: string
  name: string
  email: string
  productInterest: string | null
  quantity: number | null
  status: string
  createdAt: string
}

export default function AdminQuotesPage() {
  const [rows, setRows] = useState<QuoteRow[]>([])

  useEffect(() => {
    fetch('/api/admin/quotes')
      .then((r) => r.json())
      .then((data) => setRows(data.rows || []))
      .catch(() => setRows([]))
  }, [])

  return (
    <div>
      <h2 className="font-display text-2xl font-black uppercase mb-4">Tribe Made quotes</h2>
      {rows.length === 0 ? (
        <p className="text-ink/60">No quote requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-2 border-ink rounded-2xl overflow-hidden">
            <thead className="bg-ink text-cream">
              <tr>
                <th className="py-3 px-4 text-left">ID</th>
                <th className="py-3 px-4 text-left">Name</th>
                <th className="py-3 px-4 text-left">Email</th>
                <th className="py-3 px-4 text-left">Product</th>
                <th className="py-3 px-4 text-left">Qty</th>
                <th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ink/10">
                  <td className="py-3 px-4 font-semibold">{r.id}</td>
                  <td className="py-3 px-4">{r.name}</td>
                  <td className="py-3 px-4">{r.email}</td>
                  <td className="py-3 px-4">{r.productInterest || '—'}</td>
                  <td className="py-3 px-4">{r.quantity ?? '—'}</td>
                  <td className="py-3 px-4 capitalize">{r.status}</td>
                  <td className="py-3 px-4">{r.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
