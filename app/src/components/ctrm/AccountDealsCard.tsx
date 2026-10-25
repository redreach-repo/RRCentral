import { useCallback, useEffect, useState } from 'react'
import { lostText } from '../../lib/dealRules'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import DealFormModal, { type DealFormValues } from './DealFormModal'
import { companyTypeLabel, isOverdue, isStale, regionLabel, stageLabel } from '../../lib/ctrm'
import { listCommissions, listDeals, saveDealForm } from '../../lib/ctrmStore'
import { errorMessage } from '../../lib/errors'
import type { Account, AccountContact, AppUser, CtrmCommission, CtrmDeal } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

type Props = {
  account: Account
  contacts: AccountContact[]
  team: AppUser[]
  editable: boolean
  showCommission: boolean
  author: { appUserId: string | null; email: string }
  onChanged: () => void
}

/** The CTRM Next deal for a prospect, on its account page. */
export default function AccountDealsCard({ account, contacts, team, editable, showCommission, author, onChanged }: Props) {
  const { showToast } = useToast()
  const [deals, setDeals] = useState<CtrmDeal[]>([])
  const [commissions, setCommissions] = useState<CtrmCommission[]>([])
  const [editing, setEditing] = useState<CtrmDeal | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([listDeals(account.id), showCommission ? listCommissions() : Promise.resolve([])])
      setDeals(d)
      setCommissions(c)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the deal'), 'error')
    }
  }, [account.id, showCommission, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(values: DealFormValues) {
    setSaving(true)
    try {
      await saveDealForm(values, editing ?? null, editing ? commissions.find((c) => c.deal_id === editing.id) : undefined, [], author)
      setEditing(undefined)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the deal'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const now = new Date()
  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CTRM Next deal</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/ctrm" style={{ color: colors.muted, fontSize: 12 }}>
            Open the pipeline
          </Link>
          {editable && deals.length === 0 ? (
            <button type="button" style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }} onClick={() => setEditing(null)}>
              <Plus size={14} /> Add deal
            </button>
          ) : null}
        </div>
      </div>
      {deals.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '10px 0 0' }}>
          Not in the pipeline yet. Add a deal to track the stage and the next step.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {deals.map((d) => {
            const c = commissions.find((x) => x.deal_id === d.id)
            return (
              <div key={d.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{stageLabel(d.stage)}</strong>
                  {editable ? (
                    <button type="button" style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => setEditing(d)}>
                      Edit
                    </button>
                  ) : null}
                </div>
                <div style={{ fontSize: 13, color: colors.muted }}>
                  {regionLabel(d.region)}, {companyTypeLabel(d.company_type)}
                  {d.source ? `, from ${d.source}` : ''}
                </div>
                {d.stage === 'lost' ? (
                  <div style={{ fontSize: 13 }}>Lost: {lostText(d.lost_reason_code || '', d.lost_reason)}</div>
                ) : d.next_action ? (
                  <div style={{ fontSize: 13, color: isOverdue(d, now) ? colors.danger : colors.text }}>
                    Next: {d.next_action}
                    {d.next_action_date ? `, by ${format(parseISO(d.next_action_date), 'd MMM')}` : ''}
                    {isOverdue(d, now) ? ' (overdue)' : ''}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: isStale(d, now) ? colors.warn : colors.muted2 }}>
                  Last touch {format(parseISO(d.last_touch_at), 'd MMM yyyy')}
                </div>
                {showCommission && c ? (
                  <div style={{ fontSize: 12, color: colors.muted2 }}>
                    Red Reach commission: AED {Number(c.commission_received).toLocaleString('en-AE')} received of AED{' '}
                    {Number(c.expected_commission).toLocaleString('en-AE')} expected
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <DealFormModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        deal={editing ?? null}
        commission={editing ? commissions.find((c) => c.deal_id === editing.id) : undefined}
        prospects={[account]}
        contacts={contacts}
        team={team}
        lockedAccountId={account.id}
        defaultOwnerId={account.owner_user_id ?? author.appUserId}
        showCommission={showCommission}
        saving={saving}
        onSave={(v) => void handleSave(v)}
      />
    </section>
  )
}
