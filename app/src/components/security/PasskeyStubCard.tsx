import { useCallback, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { passkeyStubStatus, passkeysSupported } from '../../lib/mfa/passkeyStub'
import { countPasskeyStubs, enrollPasskeyStub } from '../../lib/passkeyStubStore'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** M13: passkey readiness stub — enroll nickname only; TOTP remains primary. */
export default function PasskeyStubCard() {
  const { user, isLocalMode } = useAuth()
  const { showToast } = useToast()
  const supported = passkeysSupported()
  const email = String(user?.email || '')
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (isLocalMode || !email) {
      setEnrolledCount(0)
      return
    }
    try {
      setEnrolledCount(await countPasskeyStubs(email))
    } catch {
      setEnrolledCount(0)
    }
  }, [email, isLocalMode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const status = passkeyStubStatus({ supported, enrolledCount })

  async function enroll() {
    if (!email || isLocalMode) return
    setBusy(true)
    try {
      await enrollPasskeyStub({ userEmail: email, nickname: `Passkey ${enrolledCount + 1}` })
      showToast('Passkey stub nickname saved (no live WebAuthn yet)', 'success')
      await refresh()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save passkey stub'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <KeyRound size={18} /> Passkeys (stub)
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
        {status.label}. Authenticator app (TOTP) remains the supported second factor for admin/manager.
      </p>
      {!isLocalMode && supported ? (
        <button type="button" style={buttonSecondaryStyle} disabled={busy || !email} onClick={() => void enroll()}>
          {busy ? 'Saving…' : 'Enroll stub nickname'}
        </button>
      ) : null}
    </div>
  )
}
