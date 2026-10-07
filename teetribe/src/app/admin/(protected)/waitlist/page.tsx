'use client'

import { useEffect, useState } from 'react'

type WaitlistRow = { id: string; email: string; productSlug: string | null; createdAt: string }

export default function AdminWaitlistPage() {
  const [rows, setRows] = useState<WaitlistRow[]>([])

  useEffect(() => {
    fetch('/api/admin/waitlist')
      .then((r) => r.json())
      .then((data) => setRows(data.rows || []))
      .catch(() => setRows([]))
  }, [])

  return (
    <div>
      <h2 className="font-display text-2xl font-black uppercase mb-4">Drop waitlist</h2>
      {rows.length === 0 ? (
        <p className="text-ink/60">No waitlist signups yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-2 border-ink rounded-2xl overflow-hidden">
            <thead className="bg-ink text-cream">
              <tr>
                <th className="py-3 px-4 text-left">Email</th>
                <th className="py-3 px-4 text-left">Product</th>
                <th className="py-3 px-4 text-left">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ink/10">
                  <td className="py-3 px-4">{r.email}</td>
                  <td className="py-3 px-4">{r.productSlug || 'General'}</td>
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
