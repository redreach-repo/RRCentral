import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { can } from '../../lib/permissions'
import { errorMessage } from '../../lib/errors'
import { TWO_STEP_ROLES, removeAuthenticator, teamTwoStep, type TeamTwoStep } from '../../lib/twoStep'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'
import type { UserRole } from '../../lib/types'

/** Settings card: your own two step sign in, and for admins who on the team has it. */
export default function TwoStepCard() {
  const { userRole, isLocalMode } = useAuth()
  const { showToast } = useToast()
  const [team, setTeam] = useState<TeamTwoStep[] | null>(null)
  const [busy, setBusy] = useState(false)
  const required = TWO_STEP_ROLES.includes(userRole)
  const isAdmin = can(userRole, 'users.manage')

  useEffect(() => {
    if (!isAdmin || isLocalMode) return
    teamTwoStep()
      .then(setTeam)
      .catch(() => setTeam(null))
  }, [isAdmin, isLocalMode])

  if (isLocalMode) return null

  async function reset() {
    if (!window.confirm('Remove your authenticator? You will set up a new one the next time you sign in.')) return
    setBusy(true)
    try {
      await removeAuthenticator()
      showToast('Authenticator removed. Sign out and in again to set up the new one.', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not remove the authenticator'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={18} /> Two step sign in
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
        {required
          ? 'Your role needs a code from an authenticator app at each sign in. New phone? Remove the old authenticator here, then sign in again to set up the new one.'
          : 'Required for admins and managers. Your role signs in with a password only.'}
      </p>
      {required ? (
        <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void reset()}>
          Remove my authenticator
        </button>
      ) : null}
      {team ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', fontSize: 13 }}>
          {team
            .filter((t) => t.active && TWO_STEP_ROLES.includes(t.role as UserRole))
            .map((t) => (
              <li key={t.email} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span>
                  {t.email} <span style={{ color: colors.muted2 }}>({t.role})</span>
                </span>
                <span style={{ color: t.has_two_step ? colors.success : colors.warn }}>{t.has_two_step ? 'Set up' : 'Not yet'}</span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  )
}
