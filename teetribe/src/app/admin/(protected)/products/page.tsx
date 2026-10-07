'use client'

import { useEffect, useState } from 'react'
import { products as seedProducts } from '@/data/seed'
import type { Product } from '@/lib/types'

type StockRow = { variantId: string; productName: string; size: string; color: string; stock: number }

export default function AdminProductsPage() {
  const [rows, setRows] = useState<StockRow[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [mockMode, setMockMode] = useState(true)

  useEffect(() => {
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((data) => {
        if (data.rows) {
          setRows(data.rows)
          setMockMode(data.mockMode)
        } else {
          setRows(flattenProducts(seedProducts))
        }
      })
      .catch(() => setRows(flattenProducts(seedProducts)))
  }, [])

  function flattenProducts(products: Product[]): StockRow[] {
    return products.flatMap((p) =>
      p.variants.map((v) => ({
        variantId: v.id,
        productName: p.name,
        size: v.size,
        color: v.color,
        stock: v.stock,
      })),
    )
  }

  async function updateStock(variantId: string, stock: number) {
    setSaving(variantId)
    const res = await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId, stock }),
    })
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.variantId === variantId ? { ...r, stock } : r)))
    }
    setSaving(null)
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-black uppercase mb-4">Products & stock</h2>
      {mockMode && (
        <p className="mb-4 text-sm text-ink/60">Mock mode — stock edits are local only.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-2 border-ink rounded-2xl overflow-hidden">
          <thead className="bg-ink text-cream">
            <tr>
              <th className="py-3 px-4 text-left">Product</th>
              <th className="py-3 px-4 text-left">Size</th>
              <th className="py-3 px-4 text-left">Color</th>
              <th className="py-3 px-4 text-left">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.variantId} className="border-t border-ink/10">
                <td className="py-2 px-4 font-semibold">{r.productName}</td>
                <td className="py-2 px-4">{r.size}</td>
                <td className="py-2 px-4">{r.color}</td>
                <td className="py-2 px-4">
                  <input
                    type="number"
                    min={0}
                    value={r.stock}
                    disabled={saving === r.variantId}
                    onChange={(e) => {
                      const stock = Number(e.target.value)
                      setRows((prev) => prev.map((row) => (row.variantId === r.variantId ? { ...row, stock } : row)))
                    }}
                    onBlur={(e) => updateStock(r.variantId, Number(e.target.value))}
                    className="w-20 rounded border-2 border-ink/30 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
