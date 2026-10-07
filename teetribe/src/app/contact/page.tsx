'use client'

import { useState } from 'react'

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSent(true)
  }

  return (
    <div className="container-site py-8 max-w-lg">
      <h1 className="font-display text-4xl font-black uppercase mb-4">Contact</h1>
      <p className="text-ink/70 mb-8">Questions about sizing, orders, or custom merch? We&apos;re here.</p>
      {sent ? (
        <div className="rounded-2xl border-2 border-ink bg-sunshine p-6 shadow-sticker">
          <p className="font-semibold">Message sent! We&apos;ll reply within 24 hours.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border-2 border-ink px-4 py-3 text-sm" />
          <input type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border-2 border-ink px-4 py-3 text-sm" />
          <textarea required placeholder="Your message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} className="w-full rounded-lg border-2 border-ink px-4 py-3 text-sm" />
          <button type="submit" className="btn-primary">Send message</button>
        </form>
      )}
      <p className="mt-8 text-sm text-ink/60">Or email us at <a href="mailto:info@teetribe.com" className="text-teal font-semibold hover:underline">info@teetribe.com</a></p>
    </div>
  )
}
