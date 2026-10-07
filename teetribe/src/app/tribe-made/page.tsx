'use client'

import { useState } from 'react'
import { products } from '@/data/seed'
import { ProductCard } from '@/components/ProductCard'

export default function TribeMadePage() {
  const tribeProducts = products.filter((p) => p.collection === 'tribe-made')
  const [form, setForm] = useState({ name: '', email: '', company: '', qty: '10', notes: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setStatus('success')
  }

  return (
    <div className="container-site py-8">
      <h1 className="font-display text-4xl font-black uppercase sm:text-5xl">Tribe Made</h1>
      <p className="mt-4 max-w-lg text-ink/70">Custom prints, team merch, and one-off pieces for your crew. MOQ from 10 pieces.</p>

      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tribeProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      <div className="mt-16 max-w-lg">
        <h2 className="font-display text-2xl font-black uppercase mb-4">Request a quote</h2>
        {status === 'success' ? (
          <div className="rounded-2xl border-2 border-ink bg-sunshine p-6 shadow-sticker">
            <p className="font-semibold">Quote request received! We&apos;ll be in touch within 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="text" required placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border-2 border-ink px-4 py-3 text-sm" />
            <input type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border-2 border-ink px-4 py-3 text-sm" />
            <input type="text" placeholder="Company / team name" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full rounded-lg border-2 border-ink px-4 py-3 text-sm" />
            <input type="number" min={10} placeholder="Quantity (min 10)" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="w-full rounded-lg border-2 border-ink px-4 py-3 text-sm" />
            <textarea placeholder="Tell us about your design…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className="w-full rounded-lg border-2 border-ink px-4 py-3 text-sm" />
            <button type="submit" disabled={status === 'loading'} className="btn-primary">
              {status === 'loading' ? 'Sending…' : 'Get quote'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
