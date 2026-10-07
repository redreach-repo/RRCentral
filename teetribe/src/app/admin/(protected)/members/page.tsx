'use client'

import { useEffect, useState } from 'react'

type MemberRow = {
  id: string
  email: string
  name: string | null
  discountCode: string
  usedDiscount: boolean
  createdAt: string
}

export default function AdminMembersPage() {
  const [rows, setRows] = useState<MemberRow[]>([])

  useEffect(() => {
    fetch('/api/admin/members')
      .then((r) => r.json())
      .then((data) => setRows(data.rows || []))
      .catch(() => setRows([]))
  }, [])

  return (
    <div>
      <h2 className="font-display text-2xl font-black uppercase mb-4">Tribe members</h2>
      {rows.length === 0 ? (
        <p className="text-ink/60">No members yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-2 border-ink rounded-2xl overflow-hidden">
            <thead className="bg-ink text-cream">
              <tr>
                <th className="py-3 px-4 text-left">Email</th>
                <th className="py-3 px-4 text-left">Name</th>
                <th className="py-3 px-4 text-left">Code</th>
                <th className="py-3 px-4 text-left">Used</th>
                <th className="py-3 px-4 text-left">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ink/10">
                  <td className="py-3 px-4">{r.email}</td>
                  <td className="py-3 px-4">{r.name || '—'}</td>
                  <td className="py-3 px-4 font-mono font-semibold">{r.discountCode}</td>
                  <td className="py-3 px-4">{r.usedDiscount ? 'Yes' : 'No'}</td>
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
