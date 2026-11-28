import { useEffect, useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { listActiveTeam, type TeamMember } from '../../lib/projectMembersStore'
import {
  browserLabel,
  listExports,
  listSignIns,
  offboardSummary,
  offboardUser,
  type ExportRow,
  type SignInRow,
} from '../../lib/securityLogStore'
import type { AppUser } from '../../lib/types'
import { listViewAsHistory, startViewAs, type ViewAsHistoryRow } from '../../lib/viewAs'
import { PRODUCT } from '../../lib/product'
import { buttonSecondaryStyle, colors, inputStyle, labelStyle, selectStyle } from '../../lib/uiStyles'

function when(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

/**
 * Settings, Users, edit a user: recent sign ins, recent CSV exports and the
 * leaver button (Sales lockdown PR 3). Admins only; the database checks too.
 */
export default function UserSecurityPanel({
  user,
  currentUserEmail,
  onOffboarded,
}: {
  user: AppUser
  currentUserEmail: string
  onOffboarded: () => void
}) {
  const { showToast } = useToast()
  const [signIns, setSignIns] = useState<SignInRow[]>([])
  const [exports, setExports] = useState<ExportRow[]>([])
  const [missing, setMissing] = useState(false)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [handTo, setHandTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [viewing, setViewing] = useState(false)
  const [viewHistory, setViewHistory] = useState<ViewAsHistoryRow[]>([])

  useEffect(() => {
    let live = true
    Promise.all([listSignIns(user.email), listExports(user.email), listActiveTeam().catch(() => [] as TeamMember[])])
      .then(([s, e, t]) => {
        if (!live) return
        setSignIns(s.rows)
        setExports(e.rows)
        setMissing(s.missingTable || e.missingTable)
        setTeam(t.filter((m) => m.id !== user.id))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [user.email, user.id])

  useEffect(() => {
    let live = true
    void listViewAsHistory(user.email).then((rows) => {
      if (live) setViewHistory(rows)
    })
    return () => {
      live = false
    }
  }, [user.email])

  const isSelf = user.email.toLowerCase() === currentUserEmail.toLowerCase()

  async function viewAs() {
    setViewing(true)
    try {
      await startViewAs(user.id, reason.trim())
    } catch (err) {
      showToast(errorMessage(err, 'Could not start View as'), 'error')
      setViewing(false)
    }
  }

  async function offboard() {
    if (!handTo) return
    const heir = team.find((m) => m.id === handTo)
    const ok = window.confirm(
      `${user.name || user.email} is leaving?\n\nThis switches them off, hands their accounts and leads to ${heir?.name || heir?.email}, removes their switches and project places, revokes their AI keys and signs them out everywhere.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      const r = await offboardUser(user.id, handTo)
      showToast(offboardSummary(r), 'success')
      onOffboarded()
    } catch (err) {
      showToast(errorMessage(err, 'Could not complete the leaver steps'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const small = { fontSize: 12, margin: 0, paddingLeft: 18 } as const

  return (
    <section aria-label="Sign ins, exports and leaving" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
      {missing ? (
        <p role="status" style={{ color: colors.warn, fontSize: 12 }}>
          Sign in history and the export log need the Sales safeguards SQL (sales-safeguards.sql) in Supabase.
        </p>
      ) : null}

      <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>Recent sign ins</h4>
      {signIns.length === 0 ? (
        <p style={{ ...small, paddingLeft: 0, color: colors.muted }}>None recorded yet.</p>
      ) : (
        <ul style={small}>
          {signIns.map((s) => (
            <li key={s.id}>
              {when(s.at)} · {browserLabel(s.user_agent)}
              {s.two_step ? ' · two step' : ''}
            </li>
          ))}
        </ul>
      )}

      <h4 style={{ fontSize: 13, margin: '10px 0 4px' }}>Recent CSV exports</h4>
      {exports.length === 0 ? (
        <p style={{ ...small, paddingLeft: 0, color: colors.muted }}>None.</p>
      ) : (
        <ul style={small}>
          {exports.map((e) => (
            <li key={e.id} style={{ color: e.allowed ? undefined : colors.warn }}>
              {when(e.at)} · {e.filename} · {e.row_count} row(s){e.allowed ? '' : ' · refused'}
            </li>
          ))}
        </ul>
      )}

      {user.active && !isSelf && user.role !== 'admin' ? (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>View as {user.name || user.email}</h4>
          <p style={{ fontSize: 12, color: colors.muted, margin: '0 0 6px' }}>
            Opens {PRODUCT.name} as this person so you see exactly what they see. No password needed, a red banner
            shows the whole time, it ends after 30 minutes, and every use is logged. Anything you change is saved as them.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, minWidth: 200, flex: 1 }}>
              Why (optional, kept in the log)
              <input
                style={inputStyle}
                value={reason}
                maxLength={300}
                placeholder="e.g. Check the Sales screens"
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button type="button" style={buttonSecondaryStyle} disabled={viewing} onClick={() => void viewAs()}>
              {viewing ? 'Opening…' : 'View as user'}
            </button>
          </div>
          {viewHistory.length > 0 ? (
            <ul style={{ ...small, marginTop: 6 }} aria-label="Recent View as">
              {viewHistory.map((v) => (
                <li key={v.id}>
                  {when(v.requested_at)} · {v.admin_email}
                  {v.reason ? ` · ${v.reason}` : ''}
                  {v.claimed_at ? '' : ' · not opened'}
                  {v.ended_at && v.end_reason ? ` · ${v.end_reason}` : v.ended_at ? '' : ' · open now'}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {user.active && !isSelf ? (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>Leaving the company</h4>
          <p style={{ fontSize: 12, color: colors.muted, margin: '0 0 6px' }}>
            Switches them off, hands their clients to someone else, removes their switches and project places,
            revokes their AI keys and signs them out everywhere.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, minWidth: 200 }}>
              Hand their clients to
              <select style={selectStyle} value={handTo} onChange={(e) => setHandTo(e.target.value)}>
                <option value="">Choose…</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {(m.name || m.email) + (m.role ? ` (${m.role})` : '')}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, color: colors.warn }}
              disabled={busy || !handTo}
              onClick={() => void offboard()}
            >
              {busy ? 'Working…' : 'Leaver: switch off and hand over'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
