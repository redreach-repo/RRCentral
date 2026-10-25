import { useEffect, useState, type FormEvent } from 'react'
import { ENQUIRY_OPTIONS } from '../data/verticals'
import {
  mailtoForInquiry,
  submitWebsiteInquiry,
  validateWebsiteInquiry,
  type WebsiteInquiryInput,
} from '../../lib/websiteLeads'
import { fetchLeadFormToken, pageUtm, sendLead } from '../../lib/leadIntakeStore'

const EMPTY: WebsiteInquiryInput = {
  name: '',
  email: '',
  phone: '',
  vertical: '',
  message: '',
}

export default function ContactForm({
  compact = false,
  defaultVertical = '',
  defaultMessage = '',
  submitLabel = 'Send the brief',
}: {
  compact?: boolean
  defaultVertical?: string
  defaultMessage?: string
  submitLabel?: string
}) {
  const [form, setForm] = useState({ ...EMPTY, vertical: defaultVertical, message: defaultMessage })

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      vertical: defaultVertical || prev.vertical,
      message: defaultMessage || prev.message,
    }))
  }, [defaultVertical, defaultMessage])

  const [errors, setErrors] = useState<Partial<Record<keyof WebsiteInquiryInput, string>>>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'fallback'>('idle')
  // Lead intake: a form token from the function, and a hidden field bots fill in.
  const [formToken, setFormToken] = useState('')
  const [honeypot, setHoneypot] = useState('')

  useEffect(() => {
    let alive = true
    void fetchLeadFormToken().then((t) => alive && setFormToken(t))
    return () => {
      alive = false
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const check = validateWebsiteInquiry(form)
    setErrors(check.errors)
    if (!check.ok) return
    setStatus('sending')
    try {
      // Through lead-intake (matches the contact, opens the lead, keeps the UTM values);
      // the direct insert stays as the fallback until the function is deployed.
      const viaIntake = await sendLead(
        { ...form, channel: 'website_form', website: honeypot, ...pageUtm(window.location.href) },
        formToken,
      )
      const stored = viaIntake || (await submitWebsiteInquiry(form)).stored
      setStatus(stored ? 'sent' : 'fallback')
      if (stored) setForm({ ...EMPTY, vertical: defaultVertical })
    } catch {
      setStatus('fallback')
    }
  }

  if (status === 'sent') {
    return (
      <div className="site-form-success">
        Received. The team will follow up. This enquiry is now in RR Central as a lead.
      </div>
    )
  }

  return (
    <form className="site-form" onSubmit={(e) => void onSubmit(e)}>
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }}
      />
      <label>
        Name
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoComplete="name"
        />
        {errors.name && <span className="site-form-error">{errors.name}</span>}
      </label>
      <label>
        Email
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          autoComplete="email"
        />
        {errors.email && <span className="site-form-error">{errors.email}</span>}
      </label>
      <label>
        Phone
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          autoComplete="tel"
        />
      </label>
      <label>
        Desk
        <select value={form.vertical} onChange={(e) => setForm({ ...form, vertical: e.target.value })}>
          {ENQUIRY_OPTIONS.map((option) => (
            <option key={option.value || 'empty'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Message
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          rows={compact ? 4 : 6}
          placeholder={form.vertical === 'trading' ? 'Product, material, equipment, quantity, quality, destination.' : undefined}
        />
        {errors.message && <span className="site-form-error">{errors.message}</span>}
      </label>
      {status === 'fallback' && (
        <p className="site-form-error">
          We could not store this in Central just now.{' '}
          <a href={mailtoForInquiry(form)}>Email info@redreach.ae instead</a>.
        </p>
      )}
      <button type="submit" className="site-btn site-btn-primary" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : submitLabel}
      </button>
    </form>
  )
}
