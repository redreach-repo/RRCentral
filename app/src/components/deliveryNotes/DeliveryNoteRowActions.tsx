import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import type { DeliveryNote } from '../../lib/types'
import styles from '../../styles/rowActions.module.css'

export type DeliveryNoteRowActionsProps = {
  note: DeliveryNote
  expanded: boolean
  onToggle: () => void
  onEdit: (note: DeliveryNote) => void
  onDelete: (note: DeliveryNote) => void
}

export default function DeliveryNoteRowActions({
  note,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: DeliveryNoteRowActionsProps) {
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
      <button type="button" className={styles.btn} onClick={() => onEdit(note)}>
        <Pencil size={13} /> Edit
      </button>
      <Link to={`/document/delivery-note/${note.id}`} className={styles.btnLink}>
        <ExternalLink size={13} /> PDF / Print
      </Link>
      <button type="button" className={styles.danger} onClick={() => onDelete(note)}>
        <Trash2 size={13} /> Delete
      </button>
    </div>
  )
}
