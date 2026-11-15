import { useCallback, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { passkeyStubStatus, passkeysSupported } from '../../lib/mfa/passkeyStub'
import { enrollPasskeyStub, listPasskeyStubs, type PasskeyStubRow } from '../../lib/passkeyStubStore'
import { exportListCsv } from '../../lib/listIo'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** M13: passkey readiness stub — enroll nickname only; TOTP remains primary. */
export default function PasskeyStubCard() {
  const { user, isLocalMode } = useAuth()
  const { showToast } = useToast()
  const supported = passkeysSupported()
  const email = String(user?.email || '')
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [stubs, setStubs] = useState<PasskeyStubRow[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (isLocalMode || !email) {
      setEnrolledCount(0)
      setStubs([])
      return
    }
    try {
      const rows = await listPasskeyStubs(email)
      setStubs(rows)
      setEnrolledCount(rows.length)
    } catch {
      setEnrolledCount(0)
      setStubs([])
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <KeyRound size={18} /> Passkeys (stub)
        </h2>
        {stubs.length > 0 ? (
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => {
              exportListCsv(
                'passkey-stubs.csv',
                ['nickname', 'user_email', 'created_at'],
                stubs.map((s) => ({
                  nickname: s.nickname,
                  user_email: s.user_email,
                  created_at: s.created_at,
                })),
              )
              showToast('Passkey stubs CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        ) : null}
      </div>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
        {status.label}. Authenticator app (TOTP) remains the supported second factor for admin/manager.
      </p>
      {!isLocalMode && supported ? (
        <button type="button" style={buttonSecondaryStyle} disabled={busy || !email} onClick={() => void enroll()}>
          {busy ? 'Saving…' : 'Enroll stub nickname'}
        </button>
      ) : null}
      {stubs.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', fontSize: 13 }}>
          {stubs.map((s) => (
            <li
              key={s.id}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span>{s.nickname}</span>
              <span style={{ color: colors.muted2 }}>{s.created_at ? new Date(s.created_at).toLocaleString() : ''}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
