import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authApi } from '../lib/authApi'
import BrandLogo from '../components/BrandLogo'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { user, loading, signIn, signInWithEmail, isLocalMode } = useAuth()
  const [email, setEmail] = useState('')
  const [seedEmails, setSeedEmails] = useState<string[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
    return <Navigate to="/" replace />
  }

  async function handleLocalContinue(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signInWithEmail(email)
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

        {isLocalMode ? (
          <form className={styles.localForm} onSubmit={(e) => void handleLocalContinue(e)}>
            <p className={styles.localBanner}>
              Local mode (this browser only). To share with colleagues: sign in → Settings → Data &amp; storage →
              Connect Supabase.
            </p>
            <label className={styles.fieldLabel} htmlFor="local-email">
              Email
            </label>
            <input
              id="local-email"
              className={styles.emailInput}
              type="email"
              list="local-email-suggestions"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <datalist id="local-email-suggestions">
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
            <button type="submit" className={styles.googleBtn} disabled={submitting}>
              {submitting ? 'Continuing…' : 'Continue'}
            </button>
          </form>
        ) : (
          <button type="button" className={styles.googleBtn} onClick={() => void signIn()}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.4 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.4 7.1l.1.1 6.3 5.3C37.1 41.8 44 37 44 24c0-1.3-.1-2.7-.4-3.5z"
              />
            </svg>
            Sign in with Google
          </button>
        )}
      </div>
    </div>
  )
}
