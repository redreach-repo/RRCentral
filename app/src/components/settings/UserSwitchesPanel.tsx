import { useEffect, useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { colors, labelStyle } from '../../lib/uiStyles'
import { USER_PERMISSIONS, type UserPermissionKey } from '../../lib/userPermissions'
import { listUserPermissions, setUserPermission } from '../../lib/userPermissionsStore'

/**
 * Per-person switches for a Sales user (Settings, Users, edit). Each box saves
 * at once. Sales users see only their own clients and no company money until
 * a switch here opens more.
 */
export default function UserSwitchesPanel({ userId }: { userId: string }) {
  const { showToast } = useToast()
  const [keys, setKeys] = useState<UserPermissionKey[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [busyKey, setBusyKey] = useState<UserPermissionKey | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    listUserPermissions(userId)
      .then((r) => {
        if (!live) return
        setKeys(r.keys)
        setMissingTable(r.missingTable)
      })
      .catch((err) => showToast(errorMessage(err, 'Could not load switches'), 'error'))
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [userId, showToast])

  async function toggle(key: UserPermissionKey, on: boolean) {
    setBusyKey(key)
    try {
      await setUserPermission(userId, key, on)
      setKeys((prev) => (on ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)))
      showToast(on ? 'Switched on' : 'Switched off', 'success')
    } catch (err) {
      showToast(errorMessage(err, 'Could not save the switch'), 'error')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <fieldset style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, margin: '0 0 14px' }}>
      <legend style={{ ...labelStyle, padding: '0 4px' }}>What this Sales user may see</legend>
      <p style={{ color: colors.muted, fontSize: 12, margin: '0 0 10px', lineHeight: 1.45 }}>
        Sales users see only their own clients, leads, quotes, invoices, delivery notes, POs and the projects they are
        on, and none of the company&apos;s money. Each switch saves at once and is kept in the audit log.
      </p>
      {missingTable ? (
        <p role="status" style={{ color: colors.warn, fontSize: 12, margin: 0 }}>
          Run the Sales lockdown SQL (sales-own-clients.sql) in Supabase first.
        </p>
      ) : loading ? (
        <p role="status" style={{ color: colors.muted, fontSize: 12, margin: 0 }}>Loading…</p>
      ) : (
        USER_PERMISSIONS.map((p) => {
          const id = `switch-${userId}-${p.key}`
          return (
            <div key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
              <input
                type="checkbox"
                id={id}
                checked={keys.includes(p.key)}
                disabled={busyKey !== null}
                onChange={(e) => void toggle(p.key, e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <label htmlFor={id} style={{ fontSize: 13, lineHeight: 1.4 }}>
                <strong>{p.label}</strong>
                <span style={{ display: 'block', color: colors.muted, fontSize: 12 }}>{p.description}</span>
              </label>
            </div>
          )
        })
      )}
    </fieldset>
  )
}
