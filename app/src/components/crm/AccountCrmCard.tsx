import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Users } from 'lucide-react'
import { findCrmByCompany } from '../../lib/crmSync'
import { errorMessage } from '../../lib/errors'
import type { Account, CrmEntry } from '../../lib/types'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  sectionTitleStyle,
} from '../../lib/uiStyles'

/**
 * On an Account, show the matching CRM (My Day) company when names align.
 */
export default function AccountCrmCard({ account }: { account: Account }) {
  const [crm, setCrm] = useState<CrmEntry | null | undefined>(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setCrm(undefined)
    setError('')
    void (async () => {
      try {
        const row = await findCrmByCompany(account.name)
        if (!cancelled) setCrm(row)
      } catch (e) {
        if (!cancelled) {
          setCrm(null)
          setError(errorMessage(e, 'Could not load CRM company'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [account.id, account.name])

  if (crm === undefined) {
    return (
      <section style={{ ...cardStyle, marginTop: 16 }} aria-label="CRM deal">
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CRM deal</h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: '10px 0 0' }}>Looking for a CRM company…</p>
      </section>
    )
  }

  if (!crm) {
    return (
      <section style={{ ...cardStyle, marginTop: 16 }} aria-label="CRM deal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CRM deal</h2>
          <Link to={`/crm`} style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}>
            <Users size={14} /> Open CRM
          </Link>
        </div>
        <p style={{ color: colors.muted, fontSize: 13, margin: '10px 0 0' }}>
          {error || 'No CRM company matches this account yet. Add one in CRM (My Day) with the same company name.'}
        </p>
      </section>
    )
  }

  const follow = crm.follow_up_date
    ? (() => {
        try {
          return format(parseISO(String(crm.follow_up_date).slice(0, 10)), 'd MMM yyyy')
        } catch {
          return crm.follow_up_date
        }
      })()
    : null

  return (
    <section style={{ ...cardStyle, marginTop: 16 }} aria-label="CRM deal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CRM deal</h2>
        <Link
          to={`/crm?edit=${encodeURIComponent(crm.id)}`}
          style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}
        >
          <Users size={14} /> Open in CRM
        </Link>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: colors.text }}>
        {[crm.pipeline_stage || 'Lead', crm.owner?.trim() || 'Unassigned', follow ? `Follow-up ${follow}` : null, crm.next_action?.trim() || null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {crm.notes?.trim() ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.muted, whiteSpace: 'pre-wrap' }}>{crm.notes.trim()}</p>
      ) : null}
    </section>
  )
}
