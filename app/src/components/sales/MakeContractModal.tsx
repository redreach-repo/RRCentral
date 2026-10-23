import Modal from '../Modal'
import { formatAED } from '../../lib/money'
import { contractFromQuote, startLabel } from '../../lib/salesPipeline'
import type { DeliveryPackage, SalesDeal } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors } from '../../lib/uiStyles'

type Props = {
  deal: SalesDeal | null
  companyName: string
  packages: DeliveryPackage[]
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}

/** Shows the contract the quote will become, then makes it in one press. */
export default function MakeContractModal({ deal, companyName, packages, saving, onClose, onConfirm }: Props) {
  if (!deal) return null
  const c = contractFromQuote(deal)
  const pkg = packages.find((p) => p.id === c.package_id)
  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '4px 0' }}>
      <span style={{ color: colors.muted }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
  return (
    <Modal open onClose={onClose} title={`Make the contract for ${companyName}`} width={480}>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>
        This creates the client&apos;s contract from the quote, moves the deal to Signed and the client to onboarding.
      </p>
      {row('Package', `${pkg?.name ?? 'Package'}, option ${c.option}`)}
      {row('Monthly fee', formatAED(c.monthly_fee))}
      {row('Setup fee', c.setup_fee ? formatAED(c.setup_fee) : 'None')}
      {c.discount_percent && c.discount_months_left
        ? row('Discount', `${c.discount_percent}% for ${c.discount_months_left} month${c.discount_months_left === 1 ? '' : 's'}`)
        : null}
      {row('Term', `${startLabel(c.term_start)} to ${startLabel(c.term_end)}`)}
      <p style={{ color: colors.muted2, fontSize: 12, margin: '10px 0 14px' }}>
        Automatic invoices start switched off. Turn them on in the contract on the client page when you are ready.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" style={buttonSecondaryStyle} onClick={onClose}>
          Cancel
        </button>
        <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={onConfirm}>
          {saving ? 'Making the contract…' : 'Make contract'}
        </button>
      </div>
    </Modal>
  )
}
