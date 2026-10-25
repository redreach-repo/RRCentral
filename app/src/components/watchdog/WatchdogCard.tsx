import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { itemsFor, WATCH_KIND_LABELS, type WatchRow } from '../../lib/watchdog'
import { listOpenWatchItems } from '../../lib/watchdogStore'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/**
 * What the 07:30 watchdog found, each with its owner, reason and link.
 * Defaults to the signed in person's items plus the ones nobody owns.
 * Items clear themselves the morning after the cause is fixed.
 */
export default function WatchdogCard() {
  const { appUserId } = useAuth()
  const [rows, setRows] = useState<WatchRow[] | null>(null)
  const [mineOnly, setMineOnly] = useState(true)

  useEffect(() => {
    let alive = true
    listOpenWatchItems()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [])

  const shown = useMemo(() => itemsFor(rows || [], appUserId, mineOnly), [rows, appUserId, mineOnly])
  if (!rows || rows.length === 0) return null

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="Watchdog">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <ShieldAlert size={18} /> Watchdog ({shown.length})
        </h2>
        <button type="button" style={buttonSecondaryStyle} onClick={() => setMineOnly((m) => !m)}>
          {mineOnly ? 'Show everyone’s' : 'Show mine only'}
        </button>
      </div>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        Checked every morning at 07:30. An item clears itself the morning after its cause is fixed.
      </p>
      {shown.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Nothing on your list.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {shown.map((r) => (
            <li key={r.id} style={{ borderLeft: `3px solid ${r.severity === 'urgent' ? colors.danger : colors.warn}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 14 }}>
                <Link to={r.link || '/app'} style={{ color: colors.text, fontWeight: 600 }}>
                  {r.title}
                </Link>{' '}
                <span style={{ color: colors.muted2, fontSize: 12 }}>{WATCH_KIND_LABELS[r.kind] ?? r.kind}</span>
              </div>
              <div style={{ color: colors.muted, fontSize: 13 }}>{r.reason}</div>
              <div style={{ color: colors.muted2, fontSize: 12 }}>
                {r.owner_label ? `Owner: ${r.owner_label}` : 'No owner'} · on the list for{' '}
                {formatDistanceToNowStrict(parseISO(r.first_seen_at))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
