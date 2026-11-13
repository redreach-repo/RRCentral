import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import type { Expense } from '../../lib/types'
import styles from '../../styles/rowActions.module.css'

export type ExpenseRowActionsProps = {
  expense: Expense
  expanded: boolean
  onToggle: () => void
  canDelete?: boolean
  onEdit: (e: Expense) => void
  onDelete: (e: Expense) => void
}

export default function ExpenseRowActions({
  expense,
  expanded,
  onToggle,
  canDelete = false,
  onEdit,
  onDelete,
}: ExpenseRowActionsProps) {
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
      <button type="button" className={styles.btn} onClick={() => onEdit(expense)}>
        <Pencil size={13} /> Edit
      </button>
      {canDelete ? (
        <button type="button" className={styles.danger} onClick={() => onDelete(expense)}>
          <Trash2 size={13} /> Delete
        </button>
      ) : null}
    </div>
  )
}
