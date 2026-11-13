import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Pencil,
  Phone,
  Trash2,
} from 'lucide-react'
import type { CrmEntry } from '../../lib/types'
import styles from '../../styles/rowActions.module.css'

export type CrmRowActionsProps = {
  entry: CrmEntry
  expanded: boolean
  onToggle: () => void
  busy?: boolean
  canDelete?: boolean
  phone?: string
  onLog: (entry: CrmEntry) => void
  onCall?: (entry: CrmEntry) => void
  onOpen: (entry: CrmEntry) => void
  onEmail: (entry: CrmEntry) => void
  onWhatsApp: (entry: CrmEntry) => void
  onDelete?: (entry: CrmEntry) => void
  /** Stretch chips for card layouts */
  flush?: boolean
}

/**
 * Collapsed: one Actions button.
 * Expanded: labeled chips (Log, Call, Open, Quote, Email, WhatsApp, Delete).
 */
export default function CrmRowActions({
  entry,
  expanded,
  onToggle,
  busy = false,
  canDelete = false,
  phone = '',
  onLog,
  onCall,
  onOpen,
  onEmail,
  onWhatsApp,
  onDelete,
  flush = false,
}: CrmRowActionsProps) {
  const wrapStyle = flush
    ? { marginLeft: 0, justifyContent: 'flex-start' as const, maxWidth: '100%' }
    : undefined

  if (!expanded) {
    return (
      <div className={styles.rootCollapsed} style={flush ? { justifyContent: 'flex-start' } : undefined}>
        <button type="button" className={styles.toggle} onClick={onToggle} aria-expanded={false}>
          Actions <ChevronDown size={14} />
        </button>
      </div>
    )
  }

  const tel = phone.replace(/\s+/g, '')

  return (
    <div className={styles.root} style={wrapStyle} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={styles.toggleActive} onClick={onToggle} aria-expanded>
        Hide <ChevronUp size={14} />
      </button>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => onLog(entry)}>
        <MessageSquarePlus size={13} /> Log
      </button>
      {tel ? (
        <a
          href={`tel:${tel}`}
          className={styles.btnLink}
          onClick={() => onCall?.(entry)}
        >
          <Phone size={13} /> Call
        </a>
      ) : null}
      <button type="button" className={styles.primary} disabled={busy} onClick={() => onOpen(entry)}>
        <Pencil size={13} /> Open
      </button>
      <Link
        to={`/quotations?client=${encodeURIComponent(entry.company_name)}&new=1`}
        className={styles.btnLink}
      >
        <FileText size={13} /> New quote
      </Link>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => onEmail(entry)}>
        <Mail size={13} /> Email
      </button>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => onWhatsApp(entry)}>
        <MessageCircle size={13} /> WhatsApp
      </button>
      {canDelete && onDelete ? (
        <button type="button" className={styles.danger} disabled={busy} onClick={() => onDelete(entry)}>
          <Trash2 size={13} /> Delete
        </button>
      ) : null}
    </div>
  )
}
