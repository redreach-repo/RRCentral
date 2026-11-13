import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import type { Vendor } from '../../lib/types'
import styles from '../../styles/rowActions.module.css'

export type VendorRowActionsProps = {
  vendor: Vendor
  expanded: boolean
  onToggle: () => void
  onEdit: (v: Vendor) => void
  onDelete: (v: Vendor) => void
}

export default function VendorRowActions({
  vendor,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: VendorRowActionsProps) {
  if (!expanded) {
    return (
      <div className={styles.rootCollapsed}>
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
      <button type="button" className={styles.btn} onClick={() => onEdit(vendor)}>
        <Pencil size={13} /> Edit
      </button>
      <button type="button" className={styles.danger} onClick={() => onDelete(vendor)}>
        <Trash2 size={13} /> Delete
      </button>
    </div>
  )
}
