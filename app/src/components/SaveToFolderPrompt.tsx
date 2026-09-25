import { Link } from 'react-router-dom'
import { FolderOpen, Link2 } from 'lucide-react'
import Modal from './Modal'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
} from '../lib/uiStyles'

type Props = {
  open: boolean
  company: string
  channel: 'email' | 'whatsapp'
  onClose: () => void
  /** Open the WorkDrive link modal to file this conversation. */
  onFileNow: () => void
}

/** After sending email / opening WhatsApp — nudge to file the thread on WorkDrive. */
export default function SaveToFolderPrompt({
  open,
  company,
  channel,
  onClose,
  onFileNow,
}: Props) {
  const label = channel === 'email' ? 'email' : 'WhatsApp chat'
  return (
    <Modal
      open={open}
      title="Save to customer folder?"
      onClose={onClose}
      width={440}
    >
      <p style={{ color: colors.muted, fontSize: 14, marginTop: 0, lineHeight: 1.5 }}>
        Export or save this {label} to Zoho WorkDrive, then link it on{' '}
        <strong style={{ color: colors.text }}>{company}</strong> so the CRM keeps the share URL.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={buttonSecondaryStyle} onClick={onClose}>
          Not now
        </button>
        <Link
          to={`/customer-files?company=${encodeURIComponent(company)}`}
          style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
          onClick={onClose}
        >
          <FolderOpen size={14} /> Open folder
        </Link>
        <button
          type="button"
          style={buttonPrimaryStyle}
          onClick={() => {
            onClose()
            onFileNow()
          }}
        >
          <Link2 size={14} /> Link WorkDrive file
        </button>
      </div>
    </Modal>
  )
}
