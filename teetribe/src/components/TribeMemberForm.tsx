'use client'

import { useState } from 'react'
import { useLocale } from '@/context/LocaleContext'

export function TribeMemberForm() {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [code, setCode] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.ok) {
        setCode(data.code || '')
        localStorage.setItem('teetribe-member', JSON.stringify({ email, code: data.code }))
        setStatus('success')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl border-2 border-ink bg-sunshine p-6 shadow-sticker">
        <p className="font-display text-xl font-black">Welcome to the Tribe!</p>
        <p className="mt-2 text-sm">Your code: <strong>{code}</strong> — 10% off your first order at checkout.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border-2 border-ink bg-cream p-6 shadow-sticker">
      <p className="font-display text-lg font-black">{t('memberCta')}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-full border-2 border-ink bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
        />
        <button type="submit" disabled={status === 'loading'} className="btn-primary shrink-0">
          {status === 'loading' ? 'Joining…' : 'Join'}
        </button>
      </div>
      {status === 'error' && <p className="mt-2 text-sm text-red-600">Something went wrong. Try again.</p>}
    </form>
  )
}
