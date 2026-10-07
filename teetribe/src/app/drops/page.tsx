'use client'

import { useState } from 'react'
import Link from 'next/link'
import { products, getActiveDrop } from '@/data/seed'
import { Countdown } from '@/components/Countdown'
import { ProductCard } from '@/components/ProductCard'
import { Badge } from '@/components/Badge'

export default function DropsPage() {
  const activeDrop = getActiveDrop()
  const dropProducts = products.filter((p) => p.isDrop && p.isActive)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setStatus('success')
  }

  return (
    <div className="container-site py-8">
      <Badge className="mb-4">Limited</Badge>
      <h1 className="font-display text-4xl font-black uppercase sm:text-5xl">Drops</h1>
      <p className="mt-4 max-w-lg text-ink/70">Limited runs. When they&apos;re gone, they&apos;re gone.</p>

      {activeDrop?.dropClosesAt && (
        <div className="mt-8 rounded-2xl border-2 border-ink bg-ink p-8 text-cream">
          <p className="text-sm font-bold uppercase text-sunshine">Current drop ends in</p>
          <Countdown target={activeDrop.dropClosesAt} className="mt-4" />
          <Link href={`/product/${activeDrop.slug}`} className="btn-primary mt-6 bg-sunshine text-ink hover:bg-amber">
            Shop now
          </Link>
        </div>
      )}

      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {dropProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      <div className="mt-16 rounded-2xl border-2 border-ink bg-sunshine p-8 shadow-sticker max-w-lg">
        <h2 className="font-display text-xl font-black uppercase">Waitlist</h2>
        <p className="mt-2 text-sm text-ink/70">Get notified before the next drop.</p>
        {status === 'success' ? (
          <p className="mt-4 font-semibold">You&apos;re on the list!</p>
        ) : (
          <form onSubmit={handleWaitlist} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-full border-2 border-ink bg-white px-4 py-3 text-sm"
            />
            <button type="submit" disabled={status === 'loading'} className="btn-primary shrink-0">
              {status === 'loading' ? 'Joining…' : 'Notify me'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
