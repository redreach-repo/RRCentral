import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, LOGIN_DOMAIN_REJECT_KEY } from '../contexts/AuthContext'
import { authApi } from '../lib/authApi'
import BrandLogo from '../components/BrandLogo'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { user, loading, signInWithEmail, isLocalMode } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [seedEmails, setSeedEmails] = useState<string[]>([])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
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
    setInfo('')
    setSubmitting(true)
    try {
      const result = await signInWithEmail(email)
      if (result.magicLinkSent) {
        setInfo(
          `Check your Zoho inbox for ${email.trim().toLowerCase()} — open the magic link to sign in.`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
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
          Sign in with your <strong>@redreach.ae</strong> email (Zoho Mail). Gmail is not allowed.
          <br />
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
          {error && <p className={styles.error}>{error}</p>}
          {info && (
            <p className={styles.localBanner} style={{ marginTop: 10 }}>
              {info}
            </p>
          )}
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting
              ? isLocalMode
                ? 'Continuing…'
                : 'Sending link…'
              : isLocalMode
                ? 'Continue'
                : 'Email me a login link'}
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
