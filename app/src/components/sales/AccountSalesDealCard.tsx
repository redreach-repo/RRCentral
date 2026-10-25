import { useCallback, useEffect, useState } from 'react'
import { lostText } from '../../lib/dealRules'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { FileSignature, Plus } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import MakeContractModal from './MakeContractModal'
import SalesDealFormModal, { type SalesDealFormValues } from './SalesDealFormModal'
import { listPackages } from '../../lib/deliveryStore'
import { errorMessage } from '../../lib/errors'
import { formatAED } from '../../lib/money'
import { canMakeContract, hasQuote, isSalesDealOverdue, quoteFirstYear, salesStageLabel } from '../../lib/salesPipeline'
import { listSalesDeals, makeContractFromDeal, saveSalesDealForm } from '../../lib/salesPipelineStore'
import type { Account, AppUser, DeliveryPackage, SalesDeal } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

type Props = {
  account: Account
  team: AppUser[]
  editable: boolean
  canContract: boolean
  author: { appUserId: string | null; email: string }
  onChanged: () => void
}

/** The pre-sale deal for an AI CRM account, on its page. Hidden for clients that never went through the pipeline. */
export default function AccountSalesDealCard({ account, team, editable, canContract, author, onChanged }: Props) {
  const { showToast } = useToast()
  const [deals, setDeals] = useState<SalesDeal[]>([])
  const [missingTable, setMissingTable] = useState(true)
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [editing, setEditing] = useState<SalesDeal | null | undefined>(undefined)
  const [contractFor, setContractFor] = useState<SalesDeal | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [d, pkgs] = await Promise.all([listSalesDeals(account.id), listPackages()])
      setDeals(d.rows)
      setMissingTable(d.missingTable)
      setPackages(pkgs)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the sales deal'), 'error')
    }
  }, [account.id, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(values: SalesDealFormValues) {
    setSaving(true)
    try {
      await saveSalesDealForm(values, editing ?? null, [], author)
      setEditing(undefined)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the deal'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmContract() {
    if (!contractFor) return
    setSaving(true)
    try {
      await makeContractFromDeal(contractFor, account, author)
      showToast('Contract made from the quote', 'success')
      setContractFor(null)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the contract'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Only prospects, or clients that came through the pipeline, get the card.
  if (missingTable || (deals.length === 0 && account.status !== 'prospect')) return null

  const now = new Date()
  return (
    <section style={{ ...cardStyle, marginTop: 16 }} aria-label="Sales deal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Sales deal</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to="/sales" style={{ color: colors.muted, fontSize: 12 }}>
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
          Not in the pipeline yet. Add a deal to track the stage, the quote and the next step.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {deals.map((d) => {
            const pkg = packages.find((p) => p.id === d.package_id)
            const late = isSalesDealOverdue(d, now)
            return (
              <div key={d.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{salesStageLabel(d.stage)}</strong>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {editable && canContract && canMakeContract(d) ? (
                      <button type="button" style={{ ...buttonPrimaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => setContractFor(d)}>
                        <FileSignature size={12} /> Make contract
                      </button>
                    ) : null}
                    {editable ? (
                      <button type="button" style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => setEditing(d)}>
                        Edit
                      </button>
                    ) : null}
                  </span>
                </div>
                {hasQuote(d) ? (
                  <div style={{ fontSize: 13, color: colors.muted }}>
                    Quote: {pkg?.name ?? 'Package'} option {d.option}, {formatAED(Number(d.monthly_fee))} a month
                    {Number(d.setup_fee) ? ` plus ${formatAED(Number(d.setup_fee))} setup` : ''}, first year {formatAED(quoteFirstYear(d))}
                    {d.quote_reference ? ` (${d.quote_reference})` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: colors.muted }}>No quote yet.</div>
                )}
                {d.stage === 'lost' ? (
                  <div style={{ fontSize: 13 }}>Lost: {lostText(d.lost_reason_code || '', d.lost_reason)}</div>
                ) : d.stage === 'signed' ? (
                  <div style={{ fontSize: 13 }}>Signed {d.signed_at ? format(parseISO(d.signed_at), 'd MMM yyyy') : ''}. The contract is in the Contract section below.</div>
                ) : d.next_action ? (
                  <div style={{ fontSize: 13, color: late ? colors.danger : colors.text }}>
                    Next: {d.next_action}
                    {d.next_action_date ? `, by ${format(parseISO(d.next_action_date), 'd MMM')}` : ''}
                    {late ? ' (overdue)' : ''}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <SalesDealFormModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        deal={editing ?? null}
        accounts={[account]}
        packages={packages}
        team={team}
        lockedAccountId={account.id}
        defaultOwnerId={account.owner_user_id ?? author.appUserId}
        saving={saving}
        onSave={(v) => void handleSave(v)}
      />
      <MakeContractModal
        deal={contractFor}
        companyName={account.name}
        packages={packages}
        saving={saving}
        onClose={() => setContractFor(null)}
        onConfirm={() => void confirmContract()}
      />
    </section>
  )
}
