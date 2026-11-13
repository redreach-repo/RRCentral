import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Copy, CreditCard, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import type { Invoice, UserRole } from '../../lib/types'
import { can } from '../../lib/permissions'
import { canMakePayLink } from '../../lib/invoicePayLink'
import { effectiveInvoicePaymentStatus, isCancelledInvoice } from '../../lib/finance'
import styles from '../../styles/rowActions.module.css'

export type InvoiceRowActionsProps = {
  invoice: Invoice
  expanded: boolean
  onToggle: () => void
  saving?: boolean
  userRole: UserRole
  onEdit: (inv: Invoice) => void
  onPay: (inv: Invoice) => void
  onCopyPayLink: (inv: Invoice) => void
  onMarkPaid: (inv: Invoice) => void
  onDuplicate: (inv: Invoice) => void
  onDelete: (inv: Invoice) => void
}

export default function InvoiceRowActions({
  invoice: inv,
  expanded,
  onToggle,
  saving = false,
  userRole,
  onEdit,
  onPay,
  onCopyPayLink,
  onMarkPaid,
  onDuplicate,
  onDelete,
}: InvoiceRowActionsProps) {
  const unpaid =
    !isCancelledInvoice(inv) && effectiveInvoicePaymentStatus(inv) !== 'Paid'
  const showPay = unpaid
  const showCardLink =
    canMakePayLink(userRole) &&
    Boolean(inv.reference_number) &&
    !isCancelledInvoice(inv) &&
    String(inv.status).toLowerCase() !== 'draft' &&
    unpaid
  const showMarkPaid = can(userRole, 'invoice.markPaid') && unpaid
  const showDelete = can(userRole, 'invoice.delete')

  if (!expanded) {
    return (
      <div className={styles.rootCollapsed} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.toggle} onClick={onToggle} aria-expanded={false}>
          Actions <ChevronDown size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className={styles.root} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={styles.toggleActive} onClick={onToggle} aria-expanded>
        Hide <ChevronUp size={14} />
      </button>
      <button type="button" className={styles.btn} onClick={() => onEdit(inv)}>
        <Pencil size={13} /> Edit
      </button>
      <Link to={`/document/invoice/${inv.id}`} className={styles.btnLink}>
        <ExternalLink size={13} /> PDF / Email
      </Link>
      {showPay ? (
        <button type="button" className={styles.primary} onClick={() => onPay(inv)}>
          Pay
        </button>
      ) : null}
      {showCardLink ? (
        <button
          type="button"
          className={styles.btn}
          disabled={saving}
          onClick={() => onCopyPayLink(inv)}
        >
          <CreditCard size={13} /> Card link
        </button>
      ) : null}
      {showMarkPaid ? (
        <button
          type="button"
          className={styles.btn}
          disabled={saving}
          onClick={() => onMarkPaid(inv)}
        >
          Mark paid
        </button>
      ) : null}
      <button type="button" className={styles.btn} onClick={() => onDuplicate(inv)}>
        <Copy size={13} /> Duplicate
      </button>
      {showDelete ? (
        <button type="button" className={styles.danger} onClick={() => onDelete(inv)}>
          <Trash2 size={13} /> Delete
        </button>
      ) : null}
    </div>
  )
}
