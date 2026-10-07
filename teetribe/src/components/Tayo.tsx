'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, Send, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useLocale } from '@/context/LocaleContext'

type Message = { role: 'user' | 'assistant'; text: string }

type FlowOption = { label: string; value: string }

const FLOWS: Record<string, { prompt: string; options?: FlowOption[]; reply: string }> = {
  start: {
    prompt: 'What can I help with?',
    options: [
      { label: 'Size help', value: 'size' },
      { label: 'Gift ideas', value: 'gifts' },
      { label: 'Delivery info', value: 'delivery' },
      { label: 'Order status', value: 'order' },
      { label: 'Tribe Made custom', value: 'tribemade' },
      { label: 'Ask anything', value: 'freeform' },
    ],
    reply: '',
  },
  size: {
    prompt: '',
    reply: 'Our oversized tees run big — size down for a relaxed fit. Regular tees are true to size. Check the size guide on any product page, or tell me your usual size and what fit you like.',
  },
  gifts: {
    prompt: '',
    reply: 'Great gifts: Salik Survivor tee for commuters, Karak Over Everything for chai lovers, or a limited drop hoodie. Free UAE delivery over AED 200. Want a specific budget?',
  },
  delivery: {
    prompt: '',
    reply: 'We dispatch within 1–3 business days across all UAE emirates. Free delivery on orders over AED 200; otherwise AED 15 flat. You\'ll get tracking once shipped.',
  },
  order: {
    prompt: '',
    reply: 'Track your order at /order/track with your email and order number. Paid orders get a confirmation email within minutes. Still stuck? Email alfred@redreach.ae.',
  },
  tribemade: {
    prompt: '',
    reply: 'Tribe Made is our custom merch service — team tees, event hoodies, branded caps. MOQ starts at 10 pieces. Head to /tribe-made for a quote, or tell me what you need.',
  },
}

export function Tayo() {
  const { t, locale } = useLocale()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [flow, setFlow] = useState('start')

  const addMessage = useCallback((role: 'user' | 'assistant', text: string) => {
    setMessages((prev) => [...prev, { role, text }])
  }, [])

  function openChat() {
    setOpen(true)
    if (messages.length === 0) {
      addMessage('assistant', t('tayoHi'))
      addMessage('assistant', FLOWS.start.prompt)
    }
  }

  function handleFlowOption(value: string) {
    const option = FLOWS.start.options?.find((o) => o.value === value)
    if (option) addMessage('user', option.label)

    if (value === 'freeform') {
      setFlow('freeform')
      addMessage('assistant', 'Go ahead — ask me anything about Tee Tribe!')
      return
    }

    const flowData = FLOWS[value]
    if (flowData?.reply) {
      addMessage('assistant', flowData.reply)
    }
    setFlow('start')
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    addMessage('user', text)
    setLoading(true)

    try {
      const res = await fetch('/api/tayo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, locale }),
      })
      const data = await res.json()
      addMessage('assistant', data.reply || 'Sorry, I couldn\'t process that. Try again or email alfred@redreach.ae.')
    } catch {
      addMessage('assistant', 'Connection issue — try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 right-4 z-50 flex h-[28rem] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border-2 border-ink bg-cream shadow-sticker sm:right-6"
          >
            <div className="flex items-center justify-between border-b-2 border-ink bg-teal px-4 py-3 text-cream">
              <div>
                <p className="font-display text-sm font-black uppercase">Tayo</p>
                <p className="text-xs opacity-80">Tee Tribe assistant</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-3 py-2 text-sm max-w-[85%] ${
                    m.role === 'user'
                      ? 'ml-auto bg-ink text-cream'
                      : 'mr-auto border-2 border-ink/20 bg-white'
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {flow === 'start' && messages.length <= 2 && FLOWS.start.options && (
                <div className="flex flex-wrap gap-2">
                  {FLOWS.start.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleFlowOption(opt.value)}
                      className="rounded-full border-2 border-ink px-3 py-1 text-xs font-semibold hover:bg-sunshine transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {loading && <p className="text-xs text-ink/50">Tayo is typing…</p>}
            </div>

            <div className="border-t-2 border-ink p-3 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask Tayo…"
                className="flex-1 rounded-lg border-2 border-ink/30 px-3 py-2 text-sm bg-cream focus:outline-none focus:ring-2 focus:ring-teal"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="rounded-lg bg-ink p-2 text-cream disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={open ? () => setOpen(false) : openChat}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-amber text-ink shadow-sticker sm:right-6"
        aria-label="Chat with Tayo"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </motion.button>
    </>
  )
}
