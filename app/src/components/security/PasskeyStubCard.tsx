import { KeyRound } from 'lucide-react'
import { passkeyStubStatus, passkeysSupported } from '../../lib/mfa/passkeyStub'
import { cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** M13: passkey readiness stub — enroll path later; TOTP remains primary. */
export default function PasskeyStubCard() {
  const supported = passkeysSupported()
  const status = passkeyStubStatus({ supported, enrolledCount: 0 })

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <KeyRound size={18} /> Passkeys (stub)
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
        {status.label}. Authenticator app (TOTP) remains the supported second factor for admin/manager.
      </p>
    </div>
  )
}
