import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import styles from '../styles/rowActions.module.css'

export type SimpleRowActionsProps = {
  expanded: boolean
  onToggle: () => void
  canDelete?: boolean
  editLabel?: string
  deleteLabel?: string
  onEdit: () => void
  onDelete?: () => void
}

/** Collapsed Actions → labeled Edit / Delete chips. */
export default function SimpleRowActions({
  expanded,
  onToggle,
  canDelete = true,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  onEdit,
  onDelete,
}: SimpleRowActionsProps) {
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
      <button type="button" className={styles.btn} onClick={onEdit}>
        <Pencil size={13} /> {editLabel}
      </button>
      {canDelete && onDelete ? (
        <button type="button" className={styles.danger} onClick={onDelete}>
          <Trash2 size={13} /> {deleteLabel}
        </button>
      ) : null}
    </div>
  )
}
