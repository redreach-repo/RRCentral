import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Signpost } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { listAccounts, listTeam } from '../../lib/accountsStore'
import { listDeals as listCtrmDeals } from '../../lib/ctrmStore'
import { db } from '../../lib/db'
import { noNextStep, type NoNextStepRow } from '../../lib/dealRules'
import { can } from '../../lib/permissions'
import { listSalesDeals } from '../../lib/salesPipelineStore'
import type { CrmEntry } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const PIPELINE: Record<NoNextStepRow['pipeline'], string> = { crm: 'CRM', sales: 'AI CRM sales', ctrm: 'CTRM Next' }

/**
 * Open deals with no next action or no date for it, across the CRM, AI CRM
 * sales and CTRM Next. Moves now need a next step, so this lists older deals
 * and new leads until someone gives them one. Starts on the person's own deals
 * plus the ones nobody owns.
 */
export default function NoNextStepCard() {
  const { userRole, appUserId } = useAuth()
  const [rows, setRows] = useState<NoNextStepRow[] | null>(null)
  const [mineOnly, setMineOnly] = useState(true)

  useEffect(() => {
    let alive = true
    const withCrm = can(userRole, 'legacy.access')
    Promise.all([
      listTeam(),
      listAccounts().then((r) => r.rows),
      listSalesDeals().then((r) => r.rows),
      listCtrmDeals(),
      withCrm
        ? db
            .from('crm')
            .select('id, company_name, owner, pipeline_stage, next_action, follow_up_date')
            .then((res: { data: unknown }) => (res.data || []) as CrmEntry[])
        : Promise.resolve([] as CrmEntry[]),
    ])
      .then(([users, accounts, salesDeals, ctrmDeals, crm]) => {
        if (!alive) return
        setRows(
          noNextStep({
            users,
            accountNames: new Map(accounts.map((a) => [a.id, a.name])),
            crm,
            salesDeals,
            ctrmDeals,
          }),
        )
      })
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [userRole])

  const shown = useMemo(
    () => (rows || []).filter((r) => !mineOnly || !r.owner_user_id || r.owner_user_id === appUserId),
    [rows, mineOnly, appUserId],
  )
  if (!rows || rows.length === 0) return null

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="No next step">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Signpost size={18} /> No next step ({shown.length})
        </h2>
        <button type="button" style={buttonSecondaryStyle} onClick={() => setMineOnly((m) => !m)}>
          {mineOnly ? 'Show everyone’s' : 'Show mine only'}
        </button>
      </div>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        Open deals with no next action or no date for it. Open one and add what happens next.
      </p>
      {shown.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Every one of your open deals has a next step.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {shown.slice(0, 15).map((r) => (
            <li key={r.key} style={{ fontSize: 13 }}>
              <Link to={r.link} style={{ color: colors.text, fontWeight: 600 }}>
                {r.name}
              </Link>{' '}
              <span style={{ color: colors.muted2, fontSize: 12 }}>
                {PIPELINE[r.pipeline]}, {r.missing.toLowerCase()}
                {r.owner_label ? `, ${r.owner_label}` : ', no owner'}
              </span>
            </li>
          ))}
          {shown.length > 15 ? <li style={{ color: colors.muted, fontSize: 12 }}>and {shown.length - 15} more</li> : null}
        </ul>
      )}
    </section>
  )
}
