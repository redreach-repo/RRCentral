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
  to?: string
  onClick?: () => void
}

/** One primary CTA for the quote’s status; everything else lives in More. */
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
    ) : canView ? (
      <Link to={`/document/quote/${q.id}`} className={styles.primaryLink}>
        <ExternalLink size={14} /> Open
      </Link>
    ) : (
      <button type="button" className={styles.primary} onClick={() => onEdit(q)}>
        <Pencil size={14} /> Edit
      </button>
    )

  const menu: MenuItem[] = [
    { key: 'edit', label: 'Edit', icon: <Pencil size={14} />, onClick: () => onEdit(q) },
  ]
  if (canView) {
    menu.push({
      key: 'pdf',
      label: 'PDF / Email',
      icon: <ExternalLink size={14} />,
      to: `/document/quote/${q.id}`,
    })
  }
  if (q.status === 'Finalized') {
    menu.push({
      key: 'undo',
      label: 'Undo finalize',
      icon: <RotateCcw size={14} />,
      disabled: saving,
      onClick: () => onUndoFinalize(q),
    })
  }
  if (canOutcome) {
    menu.push({
      key: 'outcome',
      label: 'Set outcome',
      icon: <Receipt size={14} />,
      onClick: () => onOutcome(q),
    })
  }
  if (canDn) {
    menu.push({
      key: 'dn',
      label: 'Delivery note',
      icon: <Truck size={14} />,
      onClick: () => onDeliveryNote(q),
    })
  }
  menu.push({
    key: 'supplier',
    label: 'Supplier invoice',
    icon: <FileUp size={14} />,
    onClick: () => onSupplierInvoice(q),
  })
  if (canBranch) {
    menu.push({
      key: 'branch',
      label: 'Branch deal',
      icon: <GitBranch size={14} />,
      disabled: saving,
      onClick: () => onBranch(q),
    })
  }
  menu.push({
    key: 'dup',
    label: 'Duplicate',
    icon: <Copy size={14} />,
    disabled: saving,
    onClick: () => onDuplicate(q),
  })
  if (canDelete) {
    menu.push({
      key: 'del',
      label: 'Delete',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => onDelete(q),
    })
  }

  return (
    <div className={styles.root} ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={styles.ghost} title="Edit" onClick={() => onEdit(q)}>
        <Pencil size={15} />
      </button>
      {primary}
      <div className={styles.moreWrap}>
        <button
          type="button"
          className={styles.ghost}
          aria-expanded={open}
          aria-haspopup="menu"
          title="More actions"
          onClick={() => setOpen((v) => !v)}
        >
          <Ellipsis size={16} />
        </button>
        {open ? (
          <div className={styles.menu} role="menu">
            {menu.map((item) =>
              item.to ? (
                <Link
                  key={item.key}
                  role="menuitem"
                  className={styles.menuItem}
                  to={item.to}
                  onClick={() => setOpen(false)}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className={item.danger ? styles.menuDanger : styles.menuItem}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onClick?.()
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
