'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import { EMIRATES } from '@/lib/types'

export default function CheckoutPage() {
  const router = useRouter()
  const { lines, subtotalFils, deliveryFils, totalFils, formatAed, clearCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '+971',
    emirate: 'Dubai' as string,
    address: '',
  })

  if (lines.length === 0) {
    return (
      <div className="container-site py-16 text-center">
        <h1 className="font-display text-3xl font-black uppercase">Nothing to checkout</h1>
        <p className="mt-4 text-ink/60">Add items to your bag first.</p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, lines, totalFils }),
      })
      const data = (await res.json()) as { redirect?: string; error?: string }
      if (!res.ok || !data.redirect) {
        setError(data.error || 'Checkout failed. Try again.')
        setLoading(false)
        return
      }
      const redirect = data.redirect
      const isAbsolute = /^https?:\/\//i.test(redirect)
      if (isAbsolute) {
        const url = new URL(redirect)
        if (url.origin !== window.location.origin) {
          window.location.assign(redirect)
          return
        }
        clearCart()
        router.push(`${url.pathname}${url.search}${url.hash}`)
        return
      }
      clearCart()
      router.push(redirect)
    } catch {
      setError('Checkout failed. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="container-site py-8">
      <h1 className="font-display text-3xl font-black uppercase mb-8">Checkout</h1>
      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required placeholder="+971 50 123 4567" />
          <div>
            <label className="text-sm font-bold">Emirate</label>
            <select
              value={form.emirate}
              onChange={(e) => setForm({ ...form, emirate: e.target.value })}
              className="mt-1 w-full rounded-lg border-2 border-ink px-4 py-3 text-sm bg-cream"
              required
            >
              {EMIRATES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} required />
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Redirecting to Stripe…' : 'Pay with Stripe'}
          </button>
          <p className="text-xs text-ink/50">Card details stay on Stripe. Without a Stripe key this host uses a demo success page.</p>
        </form>

        <div className="rounded-2xl border-2 border-ink p-6 h-fit">
          <h2 className="font-display text-lg font-black uppercase mb-4">Order summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatAed(subtotalFils)}</span></div>
            <div className="flex justify-between"><span>Delivery</span><span>{deliveryFils === 0 ? 'Free' : formatAed(deliveryFils)}</span></div>
            <div className="flex justify-between font-bold text-base border-t-2 border-ink pt-2 mt-2">
              <span>Total</span><span>{formatAed(totalFils)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="text-sm font-bold">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1 w-full rounded-lg border-2 border-ink px-4 py-3 text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-teal"
      />
    </div>
  )
}
