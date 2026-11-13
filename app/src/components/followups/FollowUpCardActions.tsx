import { ChevronDown, ChevronUp, Mail, MessageCircle, MessageSquarePlus } from 'lucide-react'
import type { CrmEntry } from '../../lib/types'
import styles from '../../styles/rowActions.module.css'

export type FollowUpCardActionsProps = {
  entry: CrmEntry
  expanded: boolean
  onToggle: () => void
  busy?: boolean
  onSnooze: (entry: CrmEntry) => void
  onClear: (entry: CrmEntry) => void
  onEmail: (entry: CrmEntry) => void
  onWhatsApp: (entry: CrmEntry) => void
  onUpdate: (entry: CrmEntry) => void
}

export default function FollowUpCardActions({
  entry,
  expanded,
  onToggle,
  busy = false,
  onSnooze,
  onClear,
  onEmail,
  onWhatsApp,
  onUpdate,
}: FollowUpCardActionsProps) {
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
    <div className={styles.root} style={{ marginLeft: 0, justifyContent: 'flex-start', maxWidth: '100%' }}>
      <button type="button" className={styles.toggleActive} onClick={onToggle} aria-expanded>
        Hide <ChevronUp size={14} />
      </button>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => onSnooze(entry)}>
        Snooze +7d
      </button>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => onClear(entry)}>
        Clear
      </button>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => onEmail(entry)}>
        <Mail size={13} /> Email
      </button>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => onWhatsApp(entry)}>
        <MessageCircle size={13} /> WhatsApp
      </button>
      <button type="button" className={styles.primary} disabled={busy} onClick={() => onUpdate(entry)}>
        <MessageSquarePlus size={13} /> Add Update
      </button>
    </div>
  )
}
