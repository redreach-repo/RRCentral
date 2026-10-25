import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { CHURCH_ACTIONS, churchActions, type ChurchAction } from '../../lib/worshiphub'
import { runChurchAction } from '../../lib/worshiphubStore'
import type { WorshipTenant } from '../../lib/types'
import { buttonSecondaryStyle, colors } from '../../lib/uiStyles'

/**
 * Accept, verify, reject or delete a church on WorshipHub, as its App admin
 * would. Shown to RR Central admins only; asks first before reject and delete.
 */
export default function ChurchActionButtons({ tenant, onDone }: { tenant: WorshipTenant; onDone: () => void }) {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const [busy, setBusy] = useState<ChurchAction | null>(null)
  if (userRole !== 'admin') return null

  const name = tenant.name || tenant.slug
  async function run(action: ChurchAction) {
    const ask = CHURCH_ACTIONS[action].confirm
    if (ask && !window.confirm(ask(name))) return
    setBusy(action)
    try {
      await runChurchAction(action, tenant)
      showToast(`${name} ${CHURCH_ACTIONS[action].done} on WorshipHub`, 'success')
      onDone()
    } catch (e) {
      showToast(errorMessage(e, 'WorshipHub could not be changed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {churchActions(tenant).map((action) => (
        <button
          key={action}
          type="button"
          style={{
            ...buttonSecondaryStyle,
            padding: '5px 9px',
            fontSize: 12,
            color: action === 'delete' || action === 'reject' ? colors.danger : undefined,
          }}
          disabled={busy !== null}
          onClick={() => void run(action)}
        >
          {busy === action ? 'Working…' : CHURCH_ACTIONS[action].label}
        </button>
      ))}
    </span>
  )
}
