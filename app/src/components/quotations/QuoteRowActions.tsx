import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileUp,
  GitBranch,
  Pencil,
  Receipt,
  RotateCcw,
  Trash2,
  Truck,
} from 'lucide-react'
import type { Quotation } from '../../lib/types'
import { canCreateDeliveryNoteFromQuote } from '../../lib/deliveryNotes'
import styles from './QuoteRowActions.module.css'

export type QuoteRowActionsProps = {
  quote: Quotation
  expanded: boolean
  onToggle: () => void
  saving?: boolean
  canDelete?: boolean
  onEdit: (q: Quotation) => void
  onFinalize: (q: Quotation) => void
  onUndoFinalize: (q: Quotation) => void
  onRevise: (q: Quotation) => void
  onOutcome: (q: Quotation) => void
  onInvoice: (q: Quotation) => void
  onDeliveryNote: (q: Quotation) => void
  onSupplierInvoice: (q: Quotation) => void
  onBranch: (q: Quotation) => void
  onDuplicate: (q: Quotation) => void
  onDelete: (q: Quotation) => void
}

/**
 * Collapsed: one Actions button (row stays a single line).
 * Expanded: labeled action chips wrap onto 2–3 lines.
 */
export default function QuoteRowActions({
  quote: q,
  expanded,
  onToggle,
  saving = false,
  canDelete = false,
  onEdit,
  onFinalize,
  onUndoFinalize,
  onRevise,
  onOutcome,
  onInvoice,
  onDeliveryNote,
  onSupplierInvoice,
  onBranch,
  onDuplicate,
  onDelete,
}: QuoteRowActionsProps) {
  const canView = Boolean(q.reference_number || q.id)
  const canBranch = Boolean(q.reference_number || q.deal_ref) && q.status !== 'Superseded'
  const canOutcome = ['Finalized', 'Sent', 'Accepted', 'Awarded'].includes(q.status)
  const canDn = canCreateDeliveryNoteFromQuote(q)

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
      <button type="button" className={styles.btn} onClick={() => onEdit(q)}>
        <Pencil size={13} /> Edit
      </button>
      {canView ? (
        <Link to={`/document/quote/${q.id}`} className={styles.btnLink}>
          <ExternalLink size={13} /> PDF / Email
        </Link>
      ) : null}

      {q.status === 'Draft' ? (
        <button
          type="button"
          className={styles.primary}
          disabled={saving}
          onClick={() => onFinalize(q)}
        >
          Finalize
        </button>
      ) : null}
      {q.status === 'Finalized' ? (
        <>
          <button
            type="button"
            className={styles.primary}
            disabled={saving}
            onClick={() => onRevise(q)}
          >
            Revise
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={saving}
            onClick={() => onUndoFinalize(q)}
          >
            <RotateCcw size={13} /> Undo
          </button>
        </>
      ) : null}
      {q.status === 'Awarded' && q.reference_number ? (
        <button type="button" className={styles.primary} onClick={() => onInvoice(q)}>
          <Receipt size={13} /> Invoice
        </button>
      ) : null}

      {canOutcome ? (
        <button type="button" className={styles.btn} onClick={() => onOutcome(q)}>
          <Receipt size={13} /> Outcome
        </button>
      ) : null}
      {canDn ? (
        <button type="button" className={styles.btn} onClick={() => onDeliveryNote(q)}>
          <Truck size={13} /> Delivery note
        </button>
      ) : null}
      <button type="button" className={styles.btn} onClick={() => onSupplierInvoice(q)}>
        <FileUp size={13} /> Supplier invoice
      </button>
      {canBranch ? (
        <button
          type="button"
          className={styles.btn}
          disabled={saving}
          onClick={() => onBranch(q)}
        >
          <GitBranch size={13} /> Branch
        </button>
      ) : null}
      <button
        type="button"
        className={styles.btn}
        disabled={saving}
        onClick={() => onDuplicate(q)}
      >
        <Copy size={13} /> Duplicate
      </button>
      {canDelete ? (
        <button type="button" className={styles.danger} onClick={() => onDelete(q)}>
          <Trash2 size={13} /> Delete
        </button>
      ) : null}
    </div>
  )
}
