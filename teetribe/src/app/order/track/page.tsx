'use client'

import { useState } from 'react'

export default function OrderTrackPage() {
  const [orderId, setOrderId] = useState('')
  const [result, setResult] = useState<string | null>(null)

  function handleTrack(e: React.FormEvent) {
    e.preventDefault()
    setResult(`Order ${orderId} — Status: Processing. Estimated delivery 2–4 business days.`)
  }

  return (
    <div className="container-site py-8 max-w-lg mx-auto">
      <h1 className="font-display text-3xl font-black uppercase mb-4">Track your order</h1>
      <p className="text-ink/70 mb-6">Enter your order number from the confirmation email.</p>
      <form onSubmit={handleTrack} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          required
          placeholder="ORD-1001"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="flex-1 rounded-full border-2 border-ink px-4 py-3 text-sm"
        />
        <button type="submit" className="btn-primary shrink-0">Track</button>
      </form>
      {result && (
        <div className="mt-6 rounded-2xl border-2 border-ink p-4">
          <p className="text-sm">{result}</p>
        </div>
      )}
    </div>
  )
}
