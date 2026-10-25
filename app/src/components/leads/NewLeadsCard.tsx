import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO, subDays } from 'date-fns'
import { Inbox } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeLeads, newLeads, type NewLead } from '../../lib/leadIntake'
import { listRecentLeads } from '../../lib/leadIntakeStore'
import { cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** Leads from the website, WhatsApp and the landing page in the last 7 days. */
export default function NewLeadsCard() {
  const { userRole } = useAuth()
  const show = canSeeLeads(userRole)
  const [rows, setRows] = useState<NewLead[] | null>(null)

  useEffect(() => {
    if (!show) return
    let alive = true
    const since = subDays(new Date(), 7)
    listRecentLeads(since)
      .then((r) => alive && setRows(newLeads(r, since)))
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [show])

  if (!show || !rows || rows.length === 0) return null

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="New leads">
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
        <Inbox size={18} /> New leads ({rows.length})
      </h2>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        From the website, WhatsApp and the AI CRM landing page in the last 7 days.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {rows.slice(0, 10).map((r) => (
          <li key={r.id} style={{ borderLeft: `3px solid ${colors.accent}`, paddingLeft: 10 }}>
            <Link to={r.link} style={{ color: colors.text, fontWeight: 600, fontSize: 14 }}>
              {r.name}
            </Link>
            <div style={{ color: colors.muted, fontSize: 13 }}>
              {r.detail} · {formatDistanceToNowStrict(parseISO(r.created_at))} ago
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
