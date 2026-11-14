import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, LOGIN_DOMAIN_REJECT_KEY } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { authApi, MIN_PASSWORD_LENGTH } from '../lib/authApi'
import { parseLoginCredentials } from '../lib/schemas/login'
import styles from './LoginPage.module.css'
import { errorMessage } from '../lib/errors'
import { PRODUCT, productAssetUrls } from '../lib/product'

const highmastAssets = productAssetUrls(import.meta.env.BASE_URL)

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
  const { t } = useI18n()
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
      <div className={styles.page} data-theme="dark">
        <div className={styles.card}>{t('page.login.loading')}</div>
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
    const parsed = parseLoginCredentials({ email, password, localMode: isLocalMode })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setSubmitting(true)
    try {
      await signInWithPassword(parsed.data.email, parsed.data.password)
    } catch (err) {
      const raw = errorMessage(err, 'Sign-in failed')
      setError(friendlyAuthError(raw))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page} data-theme="dark">
      <div className={styles.glow} aria-hidden />
      <div className={styles.card}>
        <img
          src={highmastAssets.stackedReverse}
          alt={PRODUCT.name}
          className={styles.logo}
          height={88}
        />
        <p className={styles.endorsement}>{PRODUCT.endorsement}</p>
        <h1 className={styles.srOnly}>{PRODUCT.name}</h1>
        <p className={styles.subtitle}>{PRODUCT.tagline}</p>

        <form className={styles.localForm} onSubmit={(e) => void handleContinue(e)}>
          {isLocalMode && (
            <p className={styles.localBanner}>
              Local mode (this browser only). Use a company email. To share with colleagues: Settings
              → Data &amp; storage → Connect Supabase.
            </p>
          )}
          <label className={styles.fieldLabel} htmlFor="login-email">
            {t('page.login.email')}
          </label>
          <input
            id="login-email"
            className={styles.emailInput}
            type="email"
            list="login-email-suggestions"
            placeholder="you@company.com"
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
            {t('page.login.password')}
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
          {error && (
            <p className={styles.error} role="alert" id="login-error">
              {error}
            </p>
          )}
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? t('page.login.signingIn') : t('page.login.signIn')}
          </button>
        </form>
      </div>
    </div>
  )
}
