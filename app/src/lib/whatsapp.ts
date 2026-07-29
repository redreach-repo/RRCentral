/** Normalize a phone number for wa.me using the configured country code. */
export function normalizePhone(raw: string, countryCode = '971'): string {
  let digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''

  const cc = String(countryCode || '971').replace(/\D/g, '') || '971'

  if (digits.startsWith(cc) && digits.length >= cc.length + 7) return digits
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length <= 9) return cc + digits
  return digits
}

export function buildWhatsAppUrl(phone: string, text: string, countryCode = '971'): string {
  const num = normalizePhone(phone, countryCode)
  const msg = String(text || '')
  if (num) {
    return `https://wa.me/${num}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg || 'Hello')}`
}
