import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth, subMonths } from 'date-fns'
import { Briefcase } from 'lucide-react'
import { listAccounts } from '../../lib/accountsStore'
import { HOURS_ALERT_MESSAGE, hoursAlert, renewalFlag, renewalLabel, type RenewalFlag } from '../../lib/delivery'
import { currentContract, listContracts, listPackages, listTimeEntries } from '../../lib/deliveryStore'
import { cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

type Item = { id: string; name: string; renewal: RenewalFlag | null; overHours: boolean }

/** Dashboard card: AI CRM clients due for renewal in 60 days or over their hours target. */
export default function DeliveryAlertsCard() {
  const [items, setItems] = useState<Item[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const since = format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd')
        const [{ rows }, contracts, packages, entries] = await Promise.all([
          listAccounts(),
          listContracts(),
          listPackages(),
          listTimeEntries(undefined, since),
        ])
        const out: Item[] = []
        for (const a of rows.filter((r) => r.type === 'ai_crm_client')) {
          const contract = currentContract(contracts.filter((c) => c.account_id === a.id))
          const pkg = packages.find((p) => p.id === contract?.package_id)
          const renewal = renewalFlag(contract)
          const overHours = pkg
            ? hoursAlert(entries.filter((e) => e.account_id === a.id), pkg.target_hours).flagged
            : false
          if (renewal || overHours) out.push({ id: a.id, name: a.name, renewal, overHours })
        }
        out.sort((x, y) => (x.renewal?.days ?? 999) - (y.renewal?.days ?? 999))
        if (alive) setItems(out)
      } catch {
        if (alive) setItems([])
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!items || items.length === 0) return null

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Briefcase size={18} /> AI CRM clients to look at
      </h2>
      <ul style={{ margin: 0, paddingLeft: 18, color: colors.muted, fontSize: 13, lineHeight: 1.55 }}>
        {items.slice(0, 10).map((i) => (
          <li key={i.id} style={{ marginBottom: 6 }}>
            <Link to={`/accounts/${i.id}`} style={{ color: colors.text, fontWeight: 600 }}>
              {i.name}
            </Link>
            {i.renewal ? (
              <span style={{ color: i.renewal.kind === 'ended' ? colors.danger : colors.warn }}>
                {', '}
                {renewalLabel(i.renewal).toLowerCase()}
              </span>
            ) : null}
            {i.overHours ? (
              <span style={{ color: colors.danger }}>
                {', '}over hours two months running. {HOURS_ALERT_MESSAGE}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
