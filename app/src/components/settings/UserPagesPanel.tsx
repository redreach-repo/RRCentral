import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { toggleGroup } from '../../lib/hiddenPages'
import { listHiddenPages, setPagesHidden } from '../../lib/hiddenPagesStore'
import type { UserRole } from '../../lib/types'
import { colors, labelStyle } from '../../lib/uiStyles'
import { pickablePageGroups } from '../../modules/pagePicker'

/**
 * Settings, Users, edit a person: tick the pages they see. Each box saves at
 * once and is kept in the audit log. Hiding a page removes it from their
 * sidebar and Cmd+K and blocks the address; their role still decides what data
 * they can reach.
 */
export default function UserPagesPanel({ userId, role }: { userId: string; role: UserRole }) {
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [hidden, setHidden] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [busy, setBusy] = useState(false)
  const groups = useMemo(() => pickablePageGroups(role, settings), [role, settings])

  useEffect(() => {
    let live = true
    setLoading(true)
    listHiddenPages(userId)
      .then((r) => {
        if (!live) return
        setHidden(r.pages)
        setMissingTable(r.missingTable)
      })
      .catch((err) => showToast(errorMessage(err, 'Could not load the pages'), 'error'))
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [userId, showToast])

  async function save(paths: string[], show: boolean) {
    setBusy(true)
    try {
      await setPagesHidden(userId, paths, !show)
      setHidden((prev) => toggleGroup(prev, paths, show))
      showToast(show ? 'Shown' : 'Hidden', 'success')
    } catch (err) {
      showToast(errorMessage(err, 'Could not save'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const hiddenCount = groups.reduce((n, g) => n + g.pages.filter((p) => hidden.includes(p.path)).length, 0)

  return (
    <fieldset style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, margin: '0 0 14px' }}>
      <legend style={{ ...labelStyle, padding: '0 4px' }}>Pages this person sees</legend>
      <p style={{ color: colors.muted, fontSize: 12, margin: '0 0 10px', lineHeight: 1.45 }}>
        Untick a page to take it out of their sidebar and search. Typing its address shows &quot;no access&quot;.
        Home, the Guide and their account are always there. Their role still decides what they can read or change,
        so this never opens money they cannot already see. Each box saves at once and is kept in the audit log.
      </p>
      {missingTable ? (
        <p role="status" style={{ color: colors.warn, fontSize: 12, margin: 0 }}>
          Run user-hidden-pages.sql in Supabase first.
        </p>
      ) : loading ? (
        <p role="status" style={{ color: colors.muted, fontSize: 12, margin: 0 }}>Loading…</p>
      ) : (
        <>
          <p role="status" style={{ fontSize: 12, margin: '0 0 8px' }}>
            {hiddenCount === 0 ? 'Every page for their role is shown.' : `${hiddenCount} page${hiddenCount === 1 ? '' : 's'} hidden.`}
          </p>
          {groups.map((g) => {
            const shownInGroup = g.pages.filter((p) => !hidden.includes(p.path)).length
            const groupId = `pages-${userId}-${g.id}`
            return (
              <div key={g.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    id={groupId}
                    checked={shownInGroup === g.pages.length}
                    ref={(el) => {
                      if (el) el.indeterminate = shownInGroup > 0 && shownInGroup < g.pages.length
                    }}
                    disabled={busy}
                    onChange={(e) => void save(g.pages.map((p) => p.path), e.target.checked)}
                  />
                  <label htmlFor={groupId} style={{ fontSize: 13, fontWeight: 600 }}>
                    {g.label}
                  </label>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', padding: '4px 0 0 22px' }}>
                  {g.pages.map((p) => {
                    const id = `page-${userId}-${p.path}`
                    return (
                      <span key={p.path} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          id={id}
                          checked={!hidden.includes(p.path)}
                          disabled={busy}
                          onChange={(e) => void save([p.path], e.target.checked)}
                        />
                        <label htmlFor={id} style={{ fontSize: 12 }}>
                          {p.label}
                        </label>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}
    </fieldset>
  )
}
