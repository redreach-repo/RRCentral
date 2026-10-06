import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, LOGIN_DOMAIN_REJECT_KEY } from '../contexts/AuthContext'
import { authApi, MIN_PASSWORD_LENGTH } from '../lib/authApi'
import BrandLogo from '../components/BrandLogo'
import styles from './LoginPage.module.css'

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase()
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'Wrong email or password. Ask an admin to set or reset your password in Settings → User management.'
  }
  if (msg.includes('email not confirmed')) {
    return 'This account is not confirmed yet. Ask an admin to set your password again in User management.'
  }
  return raw
}

export default function LoginPage() {
  const { user, loading, signInWithPassword, isLocalMode } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [seedEmails, setSeedEmails] = useState<string[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    try {
      const rejected = sessionStorage.getItem(LOGIN_DOMAIN_REJECT_KEY)
      if (rejected) {
        setError(rejected)
        sessionStorage.removeItem(LOGIN_DOMAIN_REJECT_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!isLocalMode || !authApi.listSeedEmails) return
    void authApi.listSeedEmails().then(setSeedEmails)
  }, [isLocalMode])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>Loading…</div>
      </div>
    )
  }

  if (user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    const dest = from && from !== '/' && from !== '/login' ? from : '/app'
    return <Navigate to={dest} replace />
  }

  async function handleContinue(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signInWithPassword(email, password)
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Sign-in failed'
      setError(friendlyAuthError(raw))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.card}>
        <BrandLogo height={52} className={styles.logo} />
        <h1 className={styles.title}>RED REACH Central</h1>
        <p className={styles.subtitle}>
          Multi-division CRM &amp; quoting for Red Reach Middle East FZE
        </p>
        <p className={styles.bookmark}>
          Bookmark: <code className={styles.bookmarkUrl}>…/RRCentral/login</code>
        </p>

        <form className={styles.localForm} onSubmit={(e) => void handleContinue(e)}>
          {isLocalMode && (
            <p className={styles.localBanner}>
              Local mode (this browser only). Use an @redreach.ae email. To share with colleagues:
              Settings → Data &amp; storage → Connect Supabase.
            </p>
          )}
          <label className={styles.fieldLabel} htmlFor="login-email">
            Email (@redreach.ae)
          </label>
          <input
            id="login-email"
            className={styles.emailInput}
            type="email"
            list="login-email-suggestions"
            placeholder="you@redreach.ae"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <datalist id="login-email-suggestions">
            {seedEmails.map((addr) => (
              <option key={addr} value={addr} />
            ))}
          </datalist>
          {seedEmails.length > 0 && (
            <div className={styles.seedList}>
              {seedEmails.map((addr) => (
                <button
                  key={addr}
                  type="button"
                  className={styles.seedChip}
                  onClick={() => setEmail(addr)}
                >
                  {addr}
                </button>
              ))}
            </div>
          )}
          <label className={styles.fieldLabel} htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className={styles.emailInput}
            type="password"
            placeholder={
              isLocalMode ? 'Any password (local mode)' : `At least ${MIN_PASSWORD_LENGTH} characters`
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required={!isLocalMode}
            minLength={isLocalMode ? undefined : MIN_PASSWORD_LENGTH}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.subtitle} style={{ marginTop: 22, marginBottom: 0 }}>
          <a href="https://www.redreach.ae" style={{ color: 'rgba(255,255,255,0.55)' }}>
            www.redreach.ae
          </a>
        </p>
      </div>
    </div>
  )
}
