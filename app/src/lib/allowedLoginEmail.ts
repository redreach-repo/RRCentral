/** Only company Google Workspace / mail may sign in to Central. */
export const ALLOWED_LOGIN_DOMAIN = 'redreach.ae'

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

export function emailDomain(email: string): string {
  const normalized = normalizeEmail(email)
  const at = normalized.lastIndexOf('@')
  if (at < 0) return ''
  return normalized.slice(at + 1)
}

export function isAllowedLoginEmail(email: string): boolean {
  const domain = emailDomain(email)
  return domain === ALLOWED_LOGIN_DOMAIN
}

export function loginEmailDomainError(email?: string): string {
  const domain = email ? emailDomain(email) : ''
  if (domain && domain !== ALLOWED_LOGIN_DOMAIN) {
    return `${email} is not allowed. Sign in with a @${ALLOWED_LOGIN_DOMAIN} account (no Gmail).`
  }
  return `Only @${ALLOWED_LOGIN_DOMAIN} email addresses can sign in.`
}
