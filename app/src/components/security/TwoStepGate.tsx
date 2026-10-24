import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { errorMessage } from '../../lib/errors'
import {
  getAssuranceLevel,
  isCodeShaped,
  startEnrollment,
  twoStepState,
  verifyCode,
  verifyExisting,
  type Enrollment,
  type TwoStepState,
} from '../../lib/twoStep'

const screen: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#121417',
  color: 'rgba(255,255,255,0.9)',
  fontFamily: "'DM Sans', sans-serif",
  padding: 16,
}
const box: CSSProperties = { maxWidth: 420, width: '100%', display: 'grid', gap: 14 }
const muted: CSSProperties = { color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, margin: 0, fontSize: 14 }
const input: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  fontSize: 22,
  letterSpacing: 6,
  textAlign: 'center',
}
const primary: CSSProperties = {
  padding: '11px 18px',
  borderRadius: 8,
  border: 0,
  background: '#e85d04',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
}
const plain: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
}

/**
 * After the password, admins and managers must pass two step sign in before
 * they see anything. Everyone else goes straight in.
 */
export default function TwoStepGate({ children }: { children: ReactNode }) {
  const { user, userRole, isLocalMode, signOut } = useAuth()
  const [state, setState] = useState<TwoStepState | 'checking'>('checking')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const check = useCallback(async () => {
    try {
      setState(twoStepState(userRole, await getAssuranceLevel(), !isLocalMode))
    } catch (e) {
      setError(errorMessage(e, 'Could not check two step sign in'))
      setState(twoStepState(userRole, { currentLevel: null, nextLevel: null }, !isLocalMode))
    }
  }, [userRole, isLocalMode])

  useEffect(() => {
    void check()
  }, [check, user?.id])

  async function begin() {
    setBusy(true)
    setError('')
    try {
      setEnrollment(await startEnrollment())
    } catch (e) {
      setError(errorMessage(e, 'Could not start set up. Check that two step sign in (TOTP) is on in Supabase Auth.'))
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isCodeShaped(code)) {
      setError('Enter the 6 digit code from your authenticator app')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (enrollment) await verifyCode(enrollment.factorId, code)
      else await verifyExisting(code)
      setCode('')
      setEnrollment(null)
      await check()
    } catch (err) {
      setError(errorMessage(err, 'That code did not work. Check the time on your phone and try the newest code.'))
    } finally {
      setBusy(false)
    }
  }

  if (state === 'not_needed' || state === 'done') return <>{children}</>
  if (state === 'checking') return <div style={screen}>Checking sign in</div>

  const codeForm = (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 10 }}>
      <input
        style={input}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={7}
        placeholder="000000"
        aria-label="6 digit code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" style={primary} disabled={busy}>
        {busy ? 'Checking' : 'Continue'}
      </button>
    </form>
  )

  return (
    <div style={screen}>
      <div style={box}>
        <h1 style={{ fontSize: 22, margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
          <ShieldCheck size={22} /> Two step sign in
        </h1>
        {state === 'enter_code' ? (
          <>
            <p style={muted}>Open your authenticator app and enter the 6 digit code for RR Central.</p>
            {codeForm}
          </>
        ) : enrollment ? (
          <>
            <p style={muted}>
              Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password), then
              enter the 6 digit code it shows.
            </p>
            <img
              src={enrollment.qrCode}
              alt="QR code to add RR Central to your authenticator app"
              style={{ width: 200, height: 200, background: '#fff', borderRadius: 8, padding: 8, justifySelf: 'center' }}
            />
            <p style={{ ...muted, fontSize: 12 }}>
              Cannot scan? Type this key into the app instead: <code style={{ wordBreak: 'break-all' }}>{enrollment.secret}</code>
            </p>
            {codeForm}
          </>
        ) : (
          <>
            <p style={muted}>
              As an {userRole === 'admin' ? 'owner' : 'admin'} you can see contracts, prices and commission, so RR Central
              asks for a code from your phone as well as your password. It takes a minute to set up, once.
            </p>
            <button type="button" style={primary} disabled={busy} onClick={() => void begin()}>
              {busy ? 'Starting' : 'Set up two step sign in'}
            </button>
          </>
        )}
        {error ? (
          <p role="alert" style={{ ...muted, color: '#ef4444' }}>
            {error}
          </p>
        ) : null}
        <button type="button" style={plain} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}
