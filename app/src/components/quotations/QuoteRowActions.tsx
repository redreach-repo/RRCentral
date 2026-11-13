import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Copy,
  Ellipsis,
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

type MenuItem = {
  key: string
  label: string
  icon: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

/**
 * Table-friendly actions: icon buttons for common ops, one labeled primary CTA,
 * and More for rarer / destructive items — more options than before without text clutter.
 */
export default function QuoteRowActions({
  quote: q,
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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const canView = Boolean(q.reference_number || q.id)
  const canBranch = Boolean(q.reference_number || q.deal_ref) && q.status !== 'Superseded'
  const canOutcome = ['Finalized', 'Sent', 'Accepted', 'Awarded'].includes(q.status)
  const canDn = canCreateDeliveryNoteFromQuote(q)

  const primary =
    q.status === 'Draft' ? (
      <button
        type="button"
        className={styles.primary}
        disabled={saving}
        onClick={() => onFinalize(q)}
      >
        Finalize
      </button>
    ) : q.status === 'Awarded' && q.reference_number ? (
      <button type="button" className={styles.primary} onClick={() => onInvoice(q)}>
        <Receipt size={14} /> Invoice
      </button>
    ) : q.status === 'Finalized' ? (
      <button
        type="button"
        className={styles.primary}
        disabled={saving}
        onClick={() => onRevise(q)}
      >
        Revise
      </button>
    ) : null

  const more: MenuItem[] = []
  if (q.status === 'Finalized') {
    more.push({
      key: 'undo',
      label: 'Undo finalize',
      icon: <RotateCcw size={14} />,
      disabled: saving,
      onClick: () => onUndoFinalize(q),
    })
  }
  if (canDelete) {
    more.push({
      key: 'del',
      label: 'Delete',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => onDelete(q),
    })
  }

  return (
    <div className={styles.root} ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={styles.icon} title="Edit" onClick={() => onEdit(q)}>
        <Pencil size={14} />
      </button>
      {canView ? (
        <Link to={`/document/quote/${q.id}`} className={styles.iconLink} title="PDF / Email">
          <ExternalLink size={14} />
        </Link>
      ) : null}
      {primary}
      {canOutcome ? (
        <button type="button" className={styles.icon} title="Set outcome" onClick={() => onOutcome(q)}>
          <Receipt size={14} />
        </button>
      ) : null}
      {canDn ? (
        <button
          type="button"
          className={styles.icon}
          title="Delivery note"
          onClick={() => onDeliveryNote(q)}
        >
          <Truck size={14} />
        </button>
      ) : null}
      <button
        type="button"
        className={styles.icon}
        title="Supplier invoice"
        onClick={() => onSupplierInvoice(q)}
      >
        <FileUp size={14} />
      </button>
      {canBranch ? (
        <button
          type="button"
          className={styles.icon}
          title="Branch deal"
          disabled={saving}
          onClick={() => onBranch(q)}
        >
          <GitBranch size={14} />
        </button>
      ) : null}
      <button
        type="button"
        className={styles.icon}
        title="Duplicate"
        disabled={saving}
        onClick={() => onDuplicate(q)}
      >
        <Copy size={14} />
      </button>
      {more.length > 0 ? (
        <div className={styles.moreWrap}>
          <button
            type="button"
            className={styles.icon}
            aria-expanded={open}
            aria-haspopup="menu"
            title="More actions"
            onClick={() => setOpen((v) => !v)}
          >
            <Ellipsis size={15} />
          </button>
          {open ? (
            <div className={styles.menu} role="menu">
              {more.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className={item.danger ? styles.menuDanger : styles.menuItem}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onClick()
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
